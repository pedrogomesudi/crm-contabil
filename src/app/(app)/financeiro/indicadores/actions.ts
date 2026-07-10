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
    .select(
      "data_inicio, clientes_financeiro(honorario_mensal, data_saida, honorario_saida), honorario_vigencia(vigente_de, valor, estimada)",
    )
    .is("excluido_em", null);
  const clientes: ClienteMetrica[] = (data ?? []).map((c) => {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    const vigRows = (c.honorario_vigencia ?? []) as { vigente_de: string; valor: number; estimada: boolean }[];
    return {
      dataInicio: (c.data_inicio as string | null) ?? null,
      dataSaida: (fin?.data_saida as string | null) ?? null,
      vigencias: vigRows.map((v) => ({
        vigenteDe: v.vigente_de,
        valor: Number(v.valor),
        estimada: v.estimada,
      })),
      honorarioSaida: fin?.honorario_saida != null ? Number(fin.honorario_saida) : null,
    };
  });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return calcularMetricas(clientes, mesesJanela(hoje.slice(0, 7), 12));
}
