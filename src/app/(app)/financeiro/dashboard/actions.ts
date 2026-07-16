"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";

export type Resumo = {
  saldo: number;
  saldo_real: number;
  mrr: number;
  recebido_mes: number;
  saidas_mes: number;
  a_receber_mes: number;
  a_pagar_mes: number;
  inadimplencia_total: number;
  inadimplencia_pct: number;
  previsao_30: number;
  previsao_60: number;
  previsao_90: number;
  receita_por_tipo: Record<string, number>;
  receita_despesa: { receita: number; despesa: number };
};
export type Aging = Record<string, { total: number; qtd: number }>;
export type MesFluxo = { mes: string; realizado: number; a_receber: number };
export type Devedor = { cliente: string; total: number; qtd: number };
export type DadosDashboard = {
  resumo: Resumo;
  aging: Aging;
  agingPagar: Aging;
  fluxo: MesFluxo[];
  devedores: Devedor[];
};

export async function carregarDashboard(competencia: string): Promise<DadosDashboard | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return null;
  const supabase = await createServerSupabase();
  const [d, ag, agP, fx, dev] = await Promise.all([
    supabase.rpc("financeiro_dashboard", { p_competencia: competencia }),
    supabase.rpc("financeiro_aging", { p_tipo: "RECEBER" }),
    supabase.rpc("financeiro_aging", { p_tipo: "PAGAR" }),
    supabase.rpc("financeiro_fluxo_caixa", { p_meses: 6 }),
    supabase.rpc("financeiro_maiores_devedores"),
  ]);
  return {
    resumo: (d.data ?? {}) as Resumo,
    aging: (ag.data ?? {}) as Aging,
    agingPagar: (agP.data ?? {}) as Aging,
    fluxo: (fx.data ?? []) as MesFluxo[],
    devedores: (dev.data ?? []) as Devedor[],
  };
}
