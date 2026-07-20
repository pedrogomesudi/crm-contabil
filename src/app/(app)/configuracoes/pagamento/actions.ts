"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function salvarAlcada(formData: FormData): Promise<void> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return;
  const raw = String(formData.get("alcada") ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const alcada = raw === "" ? null : Number(raw);
  if (alcada != null && (!Number.isFinite(alcada) || alcada < 0)) return;
  const admin = createAdminSupabase();
  await admin.from("escritorio_config").update({ alcada_pagamento: alcada }).eq("id", 1);
  revalidatePath("/configuracoes/pagamento");
}

export async function salvarConfigSuspensao(formData: FormData): Promise<void> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return;
  const num = (k: string): number | null => {
    const raw = String(formData.get(k) ?? "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const dias = num("suspensao_dias_tolerancia");
  const valor = num("suspensao_valor_minimo");
  const admin = createAdminSupabase();
  await admin
    .from("escritorio_config")
    .update({
      suspensao_dias_tolerancia: dias == null ? null : Math.round(dias),
      suspensao_valor_minimo: valor,
    })
    .eq("id", 1);
  revalidatePath("/configuracoes/pagamento");
}

export type EstadoPagamento = { ok?: boolean; erro?: string };

export async function salvarDadosPagamento(_prev: EstadoPagamento, formData: FormData): Promise<EstadoPagamento> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const s = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const template = String(formData.get("mensagem_template") ?? "").trim();
  if (!template) return { erro: "O template da mensagem não pode ficar vazio." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("dados_bancarios").upsert(
    {
      id: 1,
      pix_chave: s("pix_chave"),
      banco: s("banco"),
      agencia: s("agencia"),
      conta: s("conta"),
      titular: s("titular"),
      documento: s("documento"),
      mensagem_template: template,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/pagamento");
  return { ok: true };
}
