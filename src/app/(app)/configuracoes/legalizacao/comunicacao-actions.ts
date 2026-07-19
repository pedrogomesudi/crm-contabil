"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";

type Resp = { ok?: boolean; erro?: string };
export type ComunicacaoView = { canal: string; ativo: boolean; assunto: string | null; template: string };

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function carregarComunicacaoLeg(): Promise<ComunicacaoView> {
  const s = await createServerSupabase();
  const { data } = await s.from("legalizacao_config").select("canal, ativo, assunto, template").maybeSingle();
  return {
    canal: (data?.canal as string) ?? "email",
    ativo: (data?.ativo as boolean) ?? false,
    assunto: (data?.assunto as string | null) ?? null,
    template: (data?.template as string) ?? "",
  };
}

export async function salvarComunicacaoLeg(dados: {
  canal: "email" | "whatsapp";
  ativo: boolean;
  assunto: string | null;
  template: string;
}): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!["email", "whatsapp"].includes(dados.canal)) return { erro: "Canal inválido." };
  if (!dados.template.trim()) return { erro: "Informe a mensagem." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("legalizacao_config")
    .update({ canal: dados.canal, ativo: dados.ativo, assunto: dados.assunto, template: dados.template.trim() })
    .eq("id", true);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/legalizacao");
  return { ok: true };
}
