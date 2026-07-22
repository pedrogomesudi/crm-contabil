"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { mfaObrigatorio } from "@/lib/auth/mfaConfig";

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function carregarSeguranca(): Promise<{ obrigatorio: boolean }> {
  return { obrigatorio: await mfaObrigatorio() };
}

export async function salvarMfaObrigatorio(obrigatorio: boolean): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  // Escrita via sessão do usuário: a RLS de escritorio_config (0076) já exige admin, e o
  // trigger de integridade grava quem/quando. .eq("id", 1) mira o singleton.
  const { error } = await s.from("escritorio_config").update({ mfa_obrigatorio: obrigatorio }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/seguranca");
  return { ok: true };
}
