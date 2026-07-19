import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { agendaFollowup, type PassoAgenda } from "@/lib/comercial/followup";

export async function carregarAgendaFollowup(
  propostaId: string,
  hoje: string,
): Promise<{ enviada: boolean; passos: PassoAgenda[] }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { enviada: false, passos: [] };
  const supabase = await createServerSupabase();

  const { data: pr } = await supabase.from("proposta").select("status, enviada_em").eq("id", propostaId).maybeSingle();
  const enviadaEm = pr?.enviada_em as string | null;
  if (pr?.status !== "enviada" || !enviadaEm) return { enviada: false, passos: [] };

  const { data: etRaw } = await supabase
    .from("followup_etapa")
    .select("id, dias_offset, ordem")
    .eq("ativa", true)
    .order("ordem");
  const etapas = (etRaw ?? []).map((e) => ({ id: e.id as string, diasOffset: e.dias_offset as number }));

  const { data: envRaw } = await supabase
    .from("followup_envio")
    .select("etapa_id, enviado_em, status")
    .eq("proposta_id", propostaId);
  const envios = (envRaw ?? []).map((e) => ({
    etapaId: e.etapa_id as string,
    enviadoEm: e.enviado_em as string,
    status: e.status as string,
  }));

  return { enviada: true, passos: agendaFollowup(enviadaEm, etapas, envios, hoje) };
}
