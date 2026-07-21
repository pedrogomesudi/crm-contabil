"use server";
import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";
import { enviarWebhook } from "@/lib/webhooks/enviar";

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

export async function enviarTeste(endpointId: string): Promise<{ ok?: boolean; status?: number; erro?: string }> {
  if (!(await admOk())) return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { data: ep } = await admin.from("webhook_endpoint").select("url, secret").eq("id", endpointId).maybeSingle();
  if (!ep) return { erro: "Endpoint não encontrado." };
  const env = {
    id: randomUUID(),
    evento: "webhook.teste",
    criado_em: new Date().toISOString(),
    dados: { mensagem: "Evento de teste do SALDO" },
  };
  const r = await enviarWebhook(ep.url as string, ep.secret as string, env, 1);
  return r.ok ? { ok: true, status: r.status } : { erro: r.erro ?? `Falhou (HTTP ${r.status ?? "?"})` };
}

export type EntregaView = {
  id: string;
  url: string;
  evento: string;
  status: string;
  tentativas: number;
  proximoRetry: string;
  criadoEm: string;
};

export async function listarEntregas(): Promise<EntregaView[]> {
  if (!(await admOk())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("webhook_entrega")
    .select("id, evento, status, tentativas, proximo_retry, criado_em, webhook_endpoint(url)")
    .order("criado_em", { ascending: false })
    .limit(100);
  return (data ?? []).map((e) => {
    const ep = (Array.isArray(e.webhook_endpoint) ? e.webhook_endpoint[0] : e.webhook_endpoint) as {
      url: string;
    } | null;
    return {
      id: e.id as string,
      url: ep?.url ?? "—",
      evento: e.evento as string,
      status: e.status as string,
      tentativas: (e.tentativas as number) ?? 0,
      proximoRetry: (e.proximo_retry as string) ?? "",
      criadoEm: (e.criado_em as string) ?? "",
    };
  });
}

export async function reenviarEntrega(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admOk())) return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("webhook_entrega")
    .update({ status: "pendente", proximo_retry: new Date().toISOString() })
    .eq("id", id);
  if (error) return { erro: "Falha ao reenviar." };
  revalidatePath("/configuracoes/webhooks");
  return { ok: true };
}
