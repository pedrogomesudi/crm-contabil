"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import {
  candidatosMovimento,
  autoCasar,
  valorAssinadoBaixa,
  saldoTitulo,
  type BaixaDisp,
  type TituloAberto,
  type MovPendente,
  type CandBaixa,
  type CandTitulo,
} from "@/lib/conciliacao/casar";

export type CandidatosView = { baixas: CandBaixa[]; titulos: CandTitulo[] };

const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

async function tolerancia(supabase: Awaited<ReturnType<typeof createServerSupabase>>): Promise<number> {
  const { data } = await supabase.from("escritorio_config").select("tolerancia_conciliacao").eq("id", 1).maybeSingle();
  return Number(data?.tolerancia_conciliacao ?? 0.01);
}

async function carregarMovimento(supabase: Awaited<ReturnType<typeof createServerSupabase>>, id: string) {
  const { data } = await supabase
    .from("movimento_bancario")
    .select("id, conta_bancaria_id, data, valor, status, baixa_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function baixasDisponiveis(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  contaId: string,
  valorAbs: number,
): Promise<BaixaDisp[]> {
  const { data: linkadas } = await supabase.from("movimento_bancario").select("baixa_id").not("baixa_id", "is", null);
  const usadas = new Set((linkadas ?? []).map((r) => r.baixa_id as string));
  const { data } = await supabase
    .from("baixa")
    .select("id, valor_recebido, data_recebimento, titulo:titulo_id(tipo, clientes(razao_social))")
    .eq("conta_bancaria_id", contaId)
    .eq("estornada", false)
    .eq("valor_recebido", valorAbs);
  return (data ?? [])
    .filter((b) => !usadas.has(b.id as string))
    .map((b) => {
      const t = um(b.titulo as { tipo?: string; clientes?: unknown } | { tipo?: string; clientes?: unknown }[] | null);
      const cl = um(t?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
      return {
        baixaId: b.id as string,
        valorRecebido: Number(b.valor_recebido),
        tipoTitulo: (t?.tipo as "RECEBER" | "PAGAR") ?? "RECEBER",
        data: b.data_recebimento as string,
        clienteNome: cl?.razao_social ?? "",
      };
    });
}

async function titulosAbertos(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  tipo: "RECEBER" | "PAGAR",
): Promise<TituloAberto[]> {
  // Sem filtro por valor: o candidatosMovimento decide exato/parcial pelo saldo + tolerância.
  const { data } = await supabase
    .from("titulo")
    .select("id, valor, tipo, vencimento, descricao, baixa(valor_recebido, estornada)")
    .in("status", ["ABERTO", "VENCIDO", "BAIXADO_PARCIAL"])
    .eq("tipo", tipo)
    .limit(300);
  return (data ?? []).map((t) => {
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as {
      valor_recebido: number;
      estornada: boolean;
    }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    return {
      tituloId: t.id as string,
      valor: Number(t.valor),
      baixado,
      tipo: t.tipo as "RECEBER" | "PAGAR",
      vencimento: t.vencimento as string,
      descricao: (t.descricao as string | null) ?? "",
    };
  });
}

export async function candidatosDoMovimento(movimentoId: string): Promise<CandidatosView> {
  if (!(await gate())) return { baixas: [], titulos: [] };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov || mov.status !== "pendente") return { baixas: [], titulos: [] };
  const valor = Number(mov.valor);
  const valorAbs = Math.abs(valor);
  const tipo = valor > 0 ? "RECEBER" : "PAGAR";
  const [baixas, titulos, tol] = await Promise.all([
    baixasDisponiveis(supabase, mov.conta_bancaria_id as string, valorAbs),
    titulosAbertos(supabase, tipo),
    tolerancia(supabase),
  ]);
  return candidatosMovimento({ id: mov.id as string, valor, data: mov.data as string }, baixas, titulos, tol);
}

export async function conciliarComBaixa(
  movimentoId: string,
  baixaId: string,
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  if (mov.status !== "pendente") return { erro: "Movimento já resolvido." };
  const { data: b } = await supabase
    .from("baixa")
    .select("id, valor_recebido, estornada, titulo:titulo_id(tipo)")
    .eq("id", baixaId)
    .maybeSingle();
  if (!b || b.estornada) return { erro: "Baixa inválida." };
  const t = um(b.titulo as { tipo?: string } | { tipo?: string }[] | null);
  const assinado = valorAssinadoBaixa({
    valorRecebido: Number(b.valor_recebido),
    tipoTitulo: (t?.tipo as "RECEBER" | "PAGAR") ?? "RECEBER",
  });
  if (Math.abs(assinado - Number(mov.valor)) >= 0.005) return { erro: "Valor da baixa não confere com o movimento." };
  // Update condicional (status ainda pendente) + índice único uq_movimento_baixa fazem o vínculo atômico:
  // sem janela entre checar e gravar, mesmo sob requisições concorrentes.
  const { data: upd, error: e1 } = await supabase
    .from("movimento_bancario")
    .update({ status: "conciliada", baixa_id: baixaId })
    .eq("id", movimentoId)
    .eq("status", "pendente")
    .select("id");
  if (e1)
    return {
      erro: /duplicate key|23505|uq_movimento_baixa/i.test(e1.message)
        ? "Baixa já vinculada a outro movimento."
        : e1.message,
    };
  if (!upd || upd.length === 0) return { erro: "Movimento já resolvido." };
  await supabase.from("baixa").update({ conciliado_em: hojeSP() }).eq("id", baixaId);
  return { ok: true };
}

export async function conciliarComTitulo(
  movimentoId: string,
  tituloId: string,
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  if (mov.status !== "pendente") return { erro: "Movimento já resolvido." };
  const { data: tit } = await supabase
    .from("titulo")
    .select("id, valor, tipo, status, baixa(valor_recebido, estornada)")
    .eq("id", tituloId)
    .maybeSingle();
  if (!tit || !["ABERTO", "VENCIDO", "BAIXADO_PARCIAL"].includes(tit.status as string))
    return { erro: "Título indisponível." };
  const credito = Number(mov.valor) > 0;
  if ((credito && tit.tipo !== "RECEBER") || (!credito && tit.tipo !== "PAGAR"))
    return { erro: "Tipo do título não confere com o movimento." };
  const bxs = (Array.isArray(tit.baixa) ? tit.baixa : tit.baixa ? [tit.baixa] : []) as {
    valor_recebido: number;
    estornada: boolean;
  }[];
  const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
  // Parcial: o movimento pode quitar parte do saldo; só recusa se o supera (fora da tolerância).
  const tol = await tolerancia(supabase);
  const saldo = saldoTitulo({ valor: Number(tit.valor), baixado });
  if (Math.abs(Number(mov.valor)) > saldo + tol) return { erro: "O valor do movimento supera o saldo do título." };
  const hoje = hojeSP();
  const { data: nova, error } = await supabase
    .from("baixa")
    .insert({
      titulo_id: tituloId,
      data_recebimento: mov.data,
      valor_recebido: Math.abs(Number(mov.valor)),
      conta_bancaria_id: mov.conta_bancaria_id,
      forma_pagamento: "TRANSFERENCIA",
      criado_por: perfil.id,
      conciliado_em: hoje,
    })
    .select("id")
    .single();
  if (error || !nova) return { erro: "Falha ao criar a baixa." };
  const { data: upd, error: e2 } = await supabase
    .from("movimento_bancario")
    .update({ status: "conciliada", baixa_id: nova.id })
    .eq("id", movimentoId)
    .eq("status", "pendente")
    .select("id");
  if (e2 || !upd || upd.length === 0) {
    await supabase.from("baixa").delete().eq("id", nova.id); // desfaz a baixa: o movimento foi resolvido em paralelo
    return { erro: e2 ? e2.message : "Movimento já resolvido." };
  }
  return { ok: true };
}

export async function criarLancamento(
  movimentoId: string,
  input: { categoriaId: string; descricao: string; clienteId?: string; fornecedorId?: string },
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!input.categoriaId) return { erro: "Selecione a categoria." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  if (mov.status !== "pendente") return { erro: "Movimento já resolvido." };
  const valor = Number(mov.valor);
  const credito = valor > 0;
  if (credito && !input.clienteId) return { erro: "Selecione o cliente." };
  if (!credito && !input.fornecedorId) return { erro: "Selecione o fornecedor." };
  const tituloRow = {
    tipo: credito ? "RECEBER" : "PAGAR",
    origem: credito ? "RECEITA_AVULSA" : "DESPESA_AVULSA",
    cliente_id: credito ? input.clienteId : null,
    fornecedor_id: credito ? null : input.fornecedorId,
    valor: Math.abs(valor),
    competencia: `${(mov.data as string).slice(0, 7)}-01`,
    vencimento: mov.data,
    categoria_id: input.categoriaId,
    descricao: input.descricao || null,
    status: "ABERTO",
    criado_por: perfil.id,
  };
  const { data: titulo, error } = await supabase.from("titulo").insert(tituloRow).select("id").single();
  if (error || !titulo) return { erro: error?.message ?? "Falha ao criar o título." };
  const { data: nova, error: e2 } = await supabase
    .from("baixa")
    .insert({
      titulo_id: titulo.id,
      data_recebimento: mov.data,
      valor_recebido: Math.abs(valor),
      conta_bancaria_id: mov.conta_bancaria_id,
      forma_pagamento: "TRANSFERENCIA",
      criado_por: perfil.id,
      conciliado_em: hojeSP(),
    })
    .select("id")
    .single();
  if (e2 || !nova) {
    await supabase.from("titulo").delete().eq("id", titulo.id); // não deixa título órfão sem baixa
    return { erro: "Falha ao criar a baixa." };
  }
  const { data: upd, error: e3 } = await supabase
    .from("movimento_bancario")
    .update({ status: "conciliada", baixa_id: nova.id })
    .eq("id", movimentoId)
    .eq("status", "pendente")
    .select("id");
  if (e3 || !upd || upd.length === 0) {
    await supabase.from("baixa").delete().eq("id", nova.id);
    await supabase.from("titulo").delete().eq("id", titulo.id); // movimento resolvido em paralelo: desfaz título + baixa
    return { erro: e3 ? e3.message : "Movimento já resolvido." };
  }
  return { ok: true };
}

export async function ignorarMovimento(movimentoId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("movimento_bancario").update({ status: "ignorada" }).eq("id", movimentoId);
  return error ? { erro: error.message } : { ok: true };
}

export async function reabrirMovimento(movimentoId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  const baixaId = (mov as { baixa_id?: string | null }).baixa_id;
  const { error } = await supabase
    .from("movimento_bancario")
    .update({ status: "pendente", baixa_id: null })
    .eq("id", movimentoId);
  if (error) return { erro: error.message };
  if (baixaId) await supabase.from("baixa").update({ conciliado_em: null }).eq("id", baixaId);
  return { ok: true };
}

export async function conciliarAutomaticos(contaId: string): Promise<{ conciliados: number } | { erro: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: pend } = await supabase
    .from("movimento_bancario")
    .select("id, valor, data")
    .eq("conta_bancaria_id", contaId)
    .eq("status", "pendente");
  const movimentos: MovPendente[] = (pend ?? []).map((m) => ({
    id: m.id as string,
    valor: Number(m.valor),
    data: m.data as string,
  }));
  if (movimentos.length === 0) return { conciliados: 0 };
  const { data: linkadas } = await supabase.from("movimento_bancario").select("baixa_id").not("baixa_id", "is", null);
  const usadas = new Set((linkadas ?? []).map((r) => r.baixa_id as string));
  const { data: bx } = await supabase
    .from("baixa")
    .select("id, valor_recebido, data_recebimento, titulo:titulo_id(tipo, clientes(razao_social))")
    .eq("conta_bancaria_id", contaId)
    .eq("estornada", false);
  const baixas: BaixaDisp[] = (bx ?? [])
    .filter((b) => !usadas.has(b.id as string))
    .map((b) => {
      const t = um(b.titulo as { tipo?: string; clientes?: unknown } | { tipo?: string; clientes?: unknown }[] | null);
      const cl = um(t?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
      return {
        baixaId: b.id as string,
        valorRecebido: Number(b.valor_recebido),
        tipoTitulo: (t?.tipo as "RECEBER" | "PAGAR") ?? "RECEBER",
        data: b.data_recebimento as string,
        clienteNome: cl?.razao_social ?? "",
      };
    });
  const { data: tt } = await supabase
    .from("titulo")
    .select("id, valor, tipo, vencimento, descricao, baixa(valor_recebido, estornada)")
    .in("status", ["ABERTO", "VENCIDO"]);
  const titulos: TituloAberto[] = (tt ?? []).map((t) => {
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as {
      valor_recebido: number;
      estornada: boolean;
    }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    return {
      tituloId: t.id as string,
      valor: Number(t.valor),
      baixado,
      tipo: t.tipo as "RECEBER" | "PAGAR",
      vencimento: t.vencimento as string,
      descricao: (t.descricao as string | null) ?? "",
    };
  });
  const casamentos = autoCasar(movimentos, baixas, titulos);
  let n = 0;
  for (const c of casamentos) {
    const r =
      c.alvo === "baixa"
        ? await conciliarComBaixa(c.movimentoId, c.alvoId)
        : await conciliarComTitulo(c.movimentoId, c.alvoId);
    if (r.ok) n += 1;
  }
  return { conciliados: n };
}

export async function listarCategoriasLancamento(): Promise<{ id: string; nome: string; natureza: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("categoria").select("id, nome, natureza").eq("ativa", true).order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, natureza: c.natureza as string }));
}

export async function listarClientesLancamento(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .is("excluido_em", null)
    .order("razao_social");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }));
}

export async function listarFornecedoresLancamento(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("fornecedor").select("id, nome").order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}
