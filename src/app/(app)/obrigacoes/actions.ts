"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { gerarInstancias } from "@/lib/obrigacoes/motor";
import { mesesAte } from "@/lib/obrigacoes/retroativo";
import { montarPainel, classificarRisco, type PainelRiscos, type ItemRisco } from "@/lib/obrigacoes/risco";

export type InstanciaView = { id: string; clienteNome: string; obrigacaoNome: string; obrigacaoCodigo: string; periodicidade: string; competencia: string; vencimentoLegal: string; vencimentoInterno: string; status: string; responsavelNome: string | null; meu: boolean; entregueEm: string | null; entreguePorNome: string | null; temComprovante: boolean; comprovanteObrigatorio: boolean };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

export async function gerarCompetencia(ano: number, mes: number): Promise<{ candidatas: number; clientes: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  return gerarInstancias(supabase, ano, mes);
}

export async function gerarCompetenciaCliente(clienteId: string, ano: number, mes: number): Promise<{ candidatas: number; clientes: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  return gerarInstancias(supabase, ano, mes, clienteId);
}

export async function gerarRetroativo(anoIni: number, mesIni: number, clienteId?: string): Promise<{ meses: number; candidatas: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7));
  const meses = mesesAte(anoIni, mesIni, anoAtual, mesAtual);
  let candidatas = 0;
  for (const { ano, mes } of meses) {
    const r = await gerarInstancias(supabase, ano, mes, clienteId);
    candidatas += r.candidatas;
  }
  return { meses: meses.length, candidatas };
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listarInstancias(ano: number, mes: number, opts?: { clienteId?: string }): Promise<InstanciaView[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();
  // Filtra pela COMPETÊNCIA do mês selecionado (o que foi apurado/gerado nesse mês),
  // não pelo vencimento — que costuma cair no mês seguinte. O vencimento aparece em cada linha.
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  let q = supabase
    .from("obrigacao_instancia")
    .select("id, competencia, vencimento_legal, vencimento_interno, status, responsavel_id, entregue_em, comprovante_path, obrigacao(nome, codigo, periodicidade, comprovante_obrigatorio), clientes!inner(razao_social), responsavel:responsavel_id(nome), entregador:entregue_por(nome)")
    .gte("competencia", ini)
    .lte("competencia", fim)
    .order("vencimento_legal");
  if (opts?.clienteId) q = q.eq("cliente_id", opts.clienteId);
  else q = q.eq("clientes.status", "ativo");
  const { data } = await q;
  return (data ?? []).map((r) => {
    const o = um(r.obrigacao as { nome?: string; codigo?: string; periodicidade?: string; comprovante_obrigatorio?: boolean } | { nome?: string; codigo?: string; periodicidade?: string; comprovante_obrigatorio?: boolean }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const resp = um(r.responsavel as { nome?: string } | { nome?: string }[] | null);
    const ent = um(r.entregador as { nome?: string } | { nome?: string }[] | null);
    const entregueEm = (r.entregue_em as string | null) ?? null;
    const status = entregueEm ? "entregue" : (r.status as string);
    return {
      id: r.id as string,
      clienteNome: cl?.razao_social ?? "—",
      obrigacaoNome: o?.nome ?? "—",
      obrigacaoCodigo: o?.codigo ?? "",
      periodicidade: o?.periodicidade ?? "mensal",
      competencia: r.competencia as string,
      vencimentoLegal: r.vencimento_legal as string,
      vencimentoInterno: r.vencimento_interno as string,
      status,
      responsavelNome: resp?.nome ?? null,
      meu: (r.responsavel_id as string | null) === perfil.id,
      entregueEm,
      entreguePorNome: ent?.nome ?? null,
      temComprovante: !!r.comprovante_path,
      comprovanteObrigatorio: o?.comprovante_obrigatorio ?? true,
    };
  });
}

export async function listarRiscos(opts?: { soMeus?: boolean }): Promise<PainelRiscos> {
  const perfil = await gate();
  if (!perfil) return { resumo: { vencendoHoje: 0, vencidas: 0, semResponsavel: 0 }, grupos: [] };
  const supabase = await createServerSupabase();
  let q = supabase.from("obrigacao_instancia").select("id, competencia, vencimento_legal, vencimento_interno, responsavel_id, entregue_em, obrigacao(nome, periodicidade), clientes!inner(razao_social), responsavel:responsavel_id(nome)").eq("status", "pendente").is("entregue_em", null).eq("clientes.status", "ativo");
  if (opts?.soMeus) q = q.eq("responsavel_id", perfil.id);
  const { data } = await q;
  const itens: ItemRisco[] = (data ?? []).map((r) => {
    const o = um(r.obrigacao as { nome?: string; periodicidade?: string } | { nome?: string; periodicidade?: string }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const resp = um(r.responsavel as { nome?: string } | { nome?: string }[] | null);
    return { id: r.id as string, clienteNome: cl?.razao_social ?? "—", obrigacaoNome: o?.nome ?? "—", competencia: r.competencia as string, periodicidade: o?.periodicidade ?? "mensal", vencimentoInterno: r.vencimento_interno as string, vencimentoLegal: r.vencimento_legal as string, responsavelId: (r.responsavel_id as string | null) ?? null, responsavelNome: resp?.nome ?? null };
  });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return montarPainel(itens, hoje);
}

export async function contarRiscos(): Promise<number> {
  const perfil = await gate();
  if (!perfil) return 0;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_instancia").select("vencimento_interno, clientes!inner(id)").eq("status", "pendente").is("entregue_em", null).eq("clientes.status", "ativo");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (data ?? []).filter((r) => classificarRisco(r.vencimento_interno as string, hoje) !== "no_prazo").length;
}
