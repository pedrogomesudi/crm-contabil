"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type ReceitaConfig = { ativo: boolean; frequenciaDias: number; badgeAtivo: boolean };

export async function carregarReceitaConfig(): Promise<ReceitaConfig> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("receita_config")
    .select("ativo, frequencia_dias, badge_ativo")
    .eq("id", 1)
    .maybeSingle();
  return {
    ativo: data?.ativo ?? false,
    frequenciaDias: data?.frequencia_dias ?? 7,
    badgeAtivo: data?.badge_ativo ?? true,
  };
}

export async function salvarReceitaConfig(formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const dias = Number(String(formData.get("frequencia") ?? "").trim());
  if (!Number.isInteger(dias) || dias < 1) return { erro: "Frequência deve ser um número de dias ≥ 1." };
  const admin = createAdminSupabase();
  await admin
    .from("receita_config")
    .update({
      ativo: formData.get("ativo") === "on",
      frequencia_dias: dias,
      badge_ativo: formData.get("badge") === "on",
    })
    .eq("id", 1);
  revalidatePath("/configuracoes/receita");
  return { ok: true };
}
