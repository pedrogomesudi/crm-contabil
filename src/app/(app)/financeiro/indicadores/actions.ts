"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { mesesJanela, calcularMetricas, type ClienteMetrica, type ResumoMetricas } from "@/lib/financeiro/metricas";

export async function carregarIndicadores(): Promise<ResumoMetricas | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("data_inicio, clientes_financeiro(honorario_mensal, data_saida, honorario_saida)")
    .is("excluido_em", null);
  const clientes: ClienteMetrica[] = (data ?? []).map((c) => {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    return {
      dataInicio: (c.data_inicio as string | null) ?? null,
      dataSaida: (fin?.data_saida as string | null) ?? null,
      honorario: Number(fin?.honorario_mensal ?? 0),
      honorarioSaida: fin?.honorario_saida != null ? Number(fin.honorario_saida) : null,
    };
  });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return calcularMetricas(clientes, mesesJanela(hoje.slice(0, 7), 12));
}
