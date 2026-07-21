"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type NpsConfig = { ativo: boolean; periodicidadeDias: number; pergunta: string };

export async function carregarNps(): Promise<NpsConfig> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("escritorio_config")
    .select("nps_ativo, nps_periodicidade_dias, nps_pergunta")
    .eq("id", 1)
    .maybeSingle();
  return {
    ativo: data?.nps_ativo ?? false,
    periodicidadeDias: data?.nps_periodicidade_dias ?? 90,
    pergunta: data?.nps_pergunta ?? "",
  };
}

export async function salvarNps(formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const ativo = formData.get("ativo") === "on";
  const dias = Number(String(formData.get("periodicidade") ?? "").trim());
  if (!Number.isInteger(dias) || dias < 1) return { erro: "Periodicidade deve ser um número de dias ≥ 1." };
  const pergunta =
    String(formData.get("pergunta") ?? "")
      .trim()
      .slice(0, 300) || null;
  const admin = createAdminSupabase();
  await admin
    .from("escritorio_config")
    .update({ nps_ativo: ativo, nps_periodicidade_dias: dias, nps_pergunta: pergunta })
    .eq("id", 1);
  revalidatePath("/configuracoes/nps");
  return { ok: true };
}
