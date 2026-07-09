"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { gerarInstancias } from "@/lib/obrigacoes/motor";

export type InstanciaView = { id: string; clienteNome: string; obrigacaoNome: string; obrigacaoCodigo: string; periodicidade: string; competencia: string; vencimentoLegal: string; vencimentoInterno: string; status: string; responsavelNome: string | null; meu: boolean };

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

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listarInstancias(ano: number, mes: number, opts?: { clienteId?: string }): Promise<InstanciaView[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  let q = supabase
    .from("obrigacao_instancia")
    .select("id, competencia, vencimento_legal, vencimento_interno, status, responsavel_id, obrigacao(nome, codigo, periodicidade), clientes(razao_social), usuarios:responsavel_id(nome)")
    .gte("vencimento_legal", ini)
    .lte("vencimento_legal", fim)
    .order("vencimento_legal");
  if (opts?.clienteId) q = q.eq("cliente_id", opts.clienteId);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const o = um(r.obrigacao as { nome?: string; codigo?: string; periodicidade?: string } | { nome?: string; codigo?: string; periodicidade?: string }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const resp = um(r.usuarios as { nome?: string } | { nome?: string }[] | null);
    return {
      id: r.id as string,
      clienteNome: cl?.razao_social ?? "—",
      obrigacaoNome: o?.nome ?? "—",
      obrigacaoCodigo: o?.codigo ?? "",
      periodicidade: o?.periodicidade ?? "mensal",
      competencia: r.competencia as string,
      vencimentoLegal: r.vencimento_legal as string,
      vencimentoInterno: r.vencimento_interno as string,
      status: r.status as string,
      responsavelNome: resp?.nome ?? null,
      meu: (r.responsavel_id as string | null) === perfil.id,
    };
  });
}
