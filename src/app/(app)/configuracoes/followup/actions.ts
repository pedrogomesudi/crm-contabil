"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";

type Resp = { ok?: boolean; erro?: string };
export type FollowupView = {
  config: { canal: string; ativo: boolean };
  etapas: {
    id: string;
    diasOffset: number;
    assunto: string | null;
    template: string;
    ordem: number;
    ativa: boolean;
  }[];
};

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}
function revalidar() {
  revalidatePath("/configuracoes/followup");
}

export async function carregarFollowup(): Promise<FollowupView> {
  const s = await createServerSupabase();
  const [cfg, et] = await Promise.all([
    s.from("followup_config").select("canal, ativo").maybeSingle(),
    s.from("followup_etapa").select("id, dias_offset, assunto, template, ordem, ativa").order("ordem"),
  ]);
  return {
    config: { canal: (cfg.data?.canal as string) ?? "email", ativo: (cfg.data?.ativo as boolean) ?? false },
    etapas: (et.data ?? []).map((e) => ({
      id: e.id as string,
      diasOffset: e.dias_offset as number,
      assunto: (e.assunto as string | null) ?? null,
      template: e.template as string,
      ordem: e.ordem as number,
      ativa: e.ativa as boolean,
    })),
  };
}

export async function salvarConfigFollowup(canal: "email" | "whatsapp", ativo: boolean): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!["email", "whatsapp"].includes(canal)) return { erro: "Canal inválido." };
  const s = await createServerSupabase();
  const { error } = await s.from("followup_config").update({ canal, ativo }).eq("id", true);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function criarEtapaFollowup(): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { data } = await s.from("followup_etapa").select("ordem");
  const ordem = (data ?? []).reduce((m, r) => Math.max(m, r.ordem as number), 0) + 1;
  const { error } = await s
    .from("followup_etapa")
    .insert({ dias_offset: 3, assunto: "", template: "Olá {prospect}, tudo bem?", ordem });
  if (error) return { erro: "Falha ao criar a etapa." };
  revalidar();
  return { ok: true };
}

export async function salvarEtapaFollowup(
  id: string,
  dados: { diasOffset: number; assunto: string | null; template: string; ativa: boolean },
): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isInteger(dados.diasOffset) || dados.diasOffset < 0) return { erro: "Dias inválidos (≥ 0)." };
  if (!dados.template.trim()) return { erro: "Informe a mensagem." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("followup_etapa")
    .update({
      dias_offset: dados.diasOffset,
      assunto: dados.assunto,
      template: dados.template.trim(),
      ativa: dados.ativa,
    })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function removerEtapaFollowup(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("followup_etapa").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidar();
  return { ok: true };
}

export async function reordenarEtapasFollowup(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await s
      .from("followup_etapa")
      .update({ ordem: i + 1 })
      .eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}
