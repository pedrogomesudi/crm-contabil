import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { proximoRetry } from "./sinal";
import { enviarWebhook, montarEnvelope } from "./enviar";
import { urlWebhookSegura } from "./url-segura";

const MAX_TENTATIVAS = 4;

export async function drenarWebhooks(): Promise<{ entregues: number; falhas: number }> {
  const admin = createAdminSupabase();
  const agora = new Date().toISOString();
  const { data: fila } = await admin
    .from("webhook_entrega")
    .select("id, evento, criado_em, payload, tentativas, webhook_endpoint(url, secret, ativo)")
    .eq("status", "pendente")
    .lte("proximo_retry", agora)
    .limit(50);

  let entregues = 0;
  let falhas = 0;
  for (const e of fila ?? []) {
    const ep = (Array.isArray(e.webhook_endpoint) ? e.webhook_endpoint[0] : e.webhook_endpoint) as {
      url: string;
      secret: string;
      ativo: boolean;
    } | null;
    if (!ep || !ep.ativo || !urlWebhookSegura(ep.url).ok) {
      await admin.from("webhook_entrega").update({ status: "falhou" }).eq("id", e.id);
      continue;
    }
    const tentativa = (e.tentativas as number) + 1;
    const env = montarEnvelope({
      id: e.id as string,
      evento: e.evento as string,
      criado_em: e.criado_em as string,
      payload: e.payload,
    });
    const r = await enviarWebhook(ep.url, ep.secret, env, tentativa);
    if (r.ok) {
      await admin.from("webhook_entrega").update({ status: "ok" }).eq("id", e.id);
      entregues += 1;
    } else {
      const falhou = tentativa >= MAX_TENTATIVAS;
      await admin
        .from("webhook_entrega")
        .update({
          tentativas: tentativa,
          status: falhou ? "falhou" : "pendente",
          proximo_retry: new Date(Date.now() + proximoRetry(tentativa) * 1000).toISOString(),
        })
        .eq("id", e.id);
      falhas += 1;
    }
  }
  return { entregues, falhas };
}
