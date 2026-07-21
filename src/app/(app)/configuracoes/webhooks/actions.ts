"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";

export type EndpointView = { id: string; url: string; eventos: string[]; ativo: boolean };

async function admOk() {
  const p = await getPerfilAtual();
  return !!p?.ativo && p.papel === "admin";
}

export async function listarEndpoints(): Promise<EndpointView[]> {
  if (!(await admOk())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("webhook_endpoint")
    .select("id, url, eventos, ativo")
    .order("criado_em", { ascending: false });
  return (data ?? []).map((e) => ({
    id: e.id as string,
    url: e.url as string,
    eventos: (e.eventos as string[] | null) ?? [],
    ativo: !!e.ativo,
  }));
}

export async function criarEndpoint(url: string, eventos: string[]): Promise<{ secret?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  if (!/^https:\/\/.+/.test(url.trim())) return { erro: "Informe uma URL https válida." };
  const validos = eventos.filter((e) => (EVENTOS_WEBHOOK as readonly string[]).includes(e));
  if (validos.length === 0) return { erro: "Selecione ao menos um evento." };
  const secret = randomBytes(24).toString("hex");
  const admin = createAdminSupabase();
  const { error } = await admin.from("webhook_endpoint").insert({ url: url.trim(), secret, eventos: validos });
  if (error) return { erro: "Falha ao criar o endpoint." };
  revalidatePath("/configuracoes/webhooks");
  return { secret }; // mostrado uma vez (o consumidor usa para verificar a assinatura)
}

export async function alternarEndpoint(id: string, ativo: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("webhook_endpoint").update({ ativo }).eq("id", id);
  if (error) return { erro: "Falha ao atualizar." };
  revalidatePath("/configuracoes/webhooks");
  return { ok: true };
}

export async function removerEndpoint(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("webhook_endpoint").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidatePath("/configuracoes/webhooks");
  return { ok: true };
}
