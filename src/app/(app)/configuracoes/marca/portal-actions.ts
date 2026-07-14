"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import type { EstadoMarca } from "./actions";

// SLA das solicitações do portal: o prazo é calculado no banco (gatilho), a partir daqui.
export async function salvarSla(_prev: EstadoMarca, formData: FormData): Promise<EstadoMarca> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Apenas admin." };
  const dias = Number(formData.get("solicitacao_sla_dias"));
  if (!Number.isInteger(dias) || dias < 0 || dias > 60) return { erro: "Informe de 0 a 60 dias." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("escritorio_config").update({ solicitacao_sla_dias: dias }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar o SLA." };
  revalidatePath("/configuracoes/marca");
  return { ok: true };
}
