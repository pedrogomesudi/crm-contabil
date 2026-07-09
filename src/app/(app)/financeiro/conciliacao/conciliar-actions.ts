"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { candidatosMovimento, autoCasar, type BaixaDisp, type TituloAberto, type MovPendente, type CandBaixa, type CandTitulo } from "@/lib/conciliacao/casar";

export type CandidatosView = { baixas: CandBaixa[]; titulos: CandTitulo[] };

const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

async function carregarMovimento(supabase: Awaited<ReturnType<typeof createServerSupabase>>, id: string) {
  const { data } = await supabase.from("movimento_bancario").select("id, conta_bancaria_id, data, valor, status, baixa_id").eq("id", id).maybeSingle();
  return data;
}

async function baixasDisponiveis(supabase: Awaited<ReturnType<typeof createServerSupabase>>, contaId: string, valorAbs: number): Promise<BaixaDisp[]> {
  const { data: linkadas } = await supabase.from("movimento_bancario").select("baixa_id").not("baixa_id", "is", null);
  const usadas = new Set((linkadas ?? []).map((r) => r.baixa_id as string));
  const { data } = await supabase.from("baixa").select("id, valor_recebido, data_recebimento, titulo:titulo_id(tipo, clientes(razao_social))").eq("conta_bancaria_id", contaId).eq("estornada", false).eq("valor_recebido", valorAbs);
  return (data ?? [])
    .filter((b) => !usadas.has(b.id as string))
    .map((b) => {
      const t = um(b.titulo as { tipo?: string; clientes?: unknown } | { tipo?: string; clientes?: unknown }[] | null);
      const cl = um(t?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
      return { baixaId: b.id as string, valorRecebido: Number(b.valor_recebido), tipoTitulo: (t?.tipo as "RECEBER" | "PAGAR") ?? "RECEBER", data: b.data_recebimento as string, clienteNome: cl?.razao_social ?? "" };
    });
}

async function titulosAbertos(supabase: Awaited<ReturnType<typeof createServerSupabase>>, tipo: "RECEBER" | "PAGAR", valorAbs: number): Promise<TituloAberto[]> {
  const { data } = await supabase.from("titulo").select("id, valor, tipo, vencimento, descricao, baixa(valor_recebido, estornada)").in("status", ["ABERTO", "VENCIDO"]).eq("tipo", tipo).eq("valor", valorAbs);
  return (data ?? []).map((t) => {
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as { valor_recebido: number; estornada: boolean }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    return { tituloId: t.id as string, valor: Number(t.valor), baixado, tipo: t.tipo as "RECEBER" | "PAGAR", vencimento: t.vencimento as string, descricao: (t.descricao as string | null) ?? "" };
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
  const [baixas, titulos] = await Promise.all([baixasDisponiveis(supabase, mov.conta_bancaria_id as string, valorAbs), titulosAbertos(supabase, tipo, valorAbs)]);
  return candidatosMovimento({ id: mov.id as string, valor, data: mov.data as string }, baixas, titulos);
}

export async function conciliarComBaixa(movimentoId: string, baixaId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const hoje = hojeSP();
  const { error: e1 } = await supabase.from("movimento_bancario").update({ status: "conciliada", baixa_id: baixaId }).eq("id", movimentoId);
  if (e1) return { erro: e1.message };
  await supabase.from("baixa").update({ conciliado_em: hoje }).eq("id", baixaId);
  return { ok: true };
}

export async function conciliarComTitulo(movimentoId: string, tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
  const hoje = hojeSP();
  const { data: nova, error } = await supabase.from("baixa").insert({ titulo_id: tituloId, data_recebimento: mov.data, valor_recebido: Math.abs(Number(mov.valor)), conta_bancaria_id: mov.conta_bancaria_id, forma_pagamento: "TRANSFERENCIA", criado_por: perfil.id, conciliado_em: hoje }).select("id").single();
  if (error || !nova) return { erro: "Falha ao criar a baixa." };
  const { error: e2 } = await supabase.from("movimento_bancario").update({ status: "conciliada", baixa_id: nova.id }).eq("id", movimentoId);
  if (e2) return { erro: e2.message };
  return { ok: true };
}

export async function criarLancamento(movimentoId: string, input: { categoriaId: string; descricao: string; clienteId?: string; fornecedorId?: string }): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!input.categoriaId) return { erro: "Selecione a categoria." };
  const supabase = await createServerSupabase();
  const mov = await carregarMovimento(supabase, movimentoId);
  if (!mov) return { erro: "Movimento não encontrado." };
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
  const { data: nova, error: e2 } = await supabase.from("baixa").insert({ titulo_id: titulo.id, data_recebimento: mov.data, valor_recebido: Math.abs(valor), conta_bancaria_id: mov.conta_bancaria_id, forma_pagamento: "TRANSFERENCIA", criado_por: perfil.id, conciliado_em: hojeSP() }).select("id").single();
  if (e2 || !nova) return { erro: "Falha ao criar a baixa." };
  await supabase.from("movimento_bancario").update({ status: "conciliada", baixa_id: nova.id }).eq("id", movimentoId);
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
  const { error } = await supabase.from("movimento_bancario").update({ status: "pendente", baixa_id: null }).eq("id", movimentoId);
  if (error) return { erro: error.message };
  if (baixaId) await supabase.from("baixa").update({ conciliado_em: null }).eq("id", baixaId);
  return { ok: true };
}

export async function conciliarAutomaticos(contaId: string): Promise<{ conciliados: number } | { erro: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: pend } = await supabase.from("movimento_bancario").select("id, valor, data").eq("conta_bancaria_id", contaId).eq("status", "pendente");
  const movimentos: MovPendente[] = (pend ?? []).map((m) => ({ id: m.id as string, valor: Number(m.valor), data: m.data as string }));
  if (movimentos.length === 0) return { conciliados: 0 };
  const { data: linkadas } = await supabase.from("movimento_bancario").select("baixa_id").not("baixa_id", "is", null);
  const usadas = new Set((linkadas ?? []).map((r) => r.baixa_id as string));
  const { data: bx } = await supabase.from("baixa").select("id, valor_recebido, data_recebimento, titulo:titulo_id(tipo, clientes(razao_social))").eq("conta_bancaria_id", contaId).eq("estornada", false);
  const baixas: BaixaDisp[] = (bx ?? []).filter((b) => !usadas.has(b.id as string)).map((b) => {
    const t = um(b.titulo as { tipo?: string; clientes?: unknown } | { tipo?: string; clientes?: unknown }[] | null);
    const cl = um(t?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    return { baixaId: b.id as string, valorRecebido: Number(b.valor_recebido), tipoTitulo: (t?.tipo as "RECEBER" | "PAGAR") ?? "RECEBER", data: b.data_recebimento as string, clienteNome: cl?.razao_social ?? "" };
  });
  const { data: tt } = await supabase.from("titulo").select("id, valor, tipo, vencimento, descricao, baixa(valor_recebido, estornada)").in("status", ["ABERTO", "VENCIDO"]);
  const titulos: TituloAberto[] = (tt ?? []).map((t) => {
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as { valor_recebido: number; estornada: boolean }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    return { tituloId: t.id as string, valor: Number(t.valor), baixado, tipo: t.tipo as "RECEBER" | "PAGAR", vencimento: t.vencimento as string, descricao: (t.descricao as string | null) ?? "" };
  });
  const casamentos = autoCasar(movimentos, baixas, titulos);
  let n = 0;
  for (const c of casamentos) {
    const r = c.alvo === "baixa" ? await conciliarComBaixa(c.movimentoId, c.alvoId) : await conciliarComTitulo(c.movimentoId, c.alvoId);
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
  const { data } = await supabase.from("clientes").select("id, razao_social").is("excluido_em", null).order("razao_social");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }));
}

export async function listarFornecedoresLancamento(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("fornecedor").select("id, nome").order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}
