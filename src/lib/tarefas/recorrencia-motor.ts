import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { deveGerar, proximaData, type Periodicidade } from "@/lib/tarefas/recorrencia";

export type ResumoRecorrencia = {
  recorrencias: number;
  criadas: number;
  puladas: number;
  erros: number;
  limitadas: number;
};

// Teto por recorrência numa execução: uma semanal parada há um ano geraria 52 tarefas
// de uma vez e entupiria o painel. O teto corta a enxurrada e aparece no resumo.
const MAX_POR_RECORRENCIA = 24;

export async function processarRecorrencias(hoje: string): Promise<ResumoRecorrencia> {
  const admin = createAdminSupabase();
  const resumo: ResumoRecorrencia = { recorrencias: 0, criadas: 0, puladas: 0, erros: 0, limitadas: 0 };

  const { data: regras } = await admin
    .from("tarefa_recorrencia")
    .select(
      "id, titulo, descricao, responsavel_id, cliente_id, departamento, prioridade, periodicidade, dia_semana, dia_mes, mes, antecedencia_dias, proxima_data",
    )
    .eq("ativa", true);

  for (const r of regras ?? []) {
    resumo.recorrencias++;
    const { data: modelo } = await admin
      .from("tarefa_recorrencia_item")
      .select("descricao, ordem")
      .eq("recorrencia_id", r.id as string)
      .order("ordem");

    let proxima = r.proxima_data as string;
    let geradas = 0;

    while (deveGerar(proxima, r.antecedencia_dias as number, hoje)) {
      if (geradas >= MAX_POR_RECORRENCIA) {
        resumo.limitadas++;
        break;
      }

      const { data: tarefa, error } = await admin
        .from("tarefa")
        .insert({
          titulo: r.titulo,
          descricao: r.descricao,
          responsavel_id: r.responsavel_id,
          cliente_id: r.cliente_id,
          departamento: r.departamento,
          prioridade: r.prioridade,
          prazo: proxima,
          recorrencia_id: r.id,
          competencia: proxima,
        })
        .select("id")
        .single();

      if (error) {
        // Índice único (recorrencia_id, competencia): a ocorrência já existia —
        // reexecução do cron. Não é erro; segue e avança a data.
        resumo.puladas++;
      } else {
        resumo.criadas++;
        if (tarefa && (modelo ?? []).length > 0) {
          await admin.from("tarefa_item").insert(
            (modelo ?? []).map((i) => ({
              tarefa_id: tarefa.id as string,
              descricao: i.descricao as string,
              ordem: i.ordem as number,
            })),
          );
        }
      }

      geradas++;
      proxima = proximaData(proxima, {
        periodicidade: r.periodicidade as Periodicidade,
        diaSemana: r.dia_semana as number | null,
        diaMes: r.dia_mes as number | null,
        mes: r.mes as number | null,
      });
    }

    if (proxima !== (r.proxima_data as string)) {
      const { error } = await admin
        .from("tarefa_recorrencia")
        .update({ proxima_data: proxima, atualizado_em: new Date().toISOString() })
        .eq("id", r.id as string);
      if (error) resumo.erros++;
    }
  }

  return resumo;
}
