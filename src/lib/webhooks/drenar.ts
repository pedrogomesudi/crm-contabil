import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { assinar, proximoRetry } from "./sinal";

const MAX_TENTATIVAS = 4;
const comTimeout = async <T>(fn: (s: AbortSignal) => Promise<T>): Promise<T> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
};

export async function drenarWebhooks(): Promise<{ entregues: number; falhas: number }> {
  const admin = createAdminSupabase();
  const agora = new Date().toISOString();
  const { data: fila } = await admin
    .from("webhook_entrega")
    .select("id, evento, payload, tentativas, webhook_endpoint(url, secret, ativo)")
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
    if (!ep || !ep.ativo) {
      await admin.from("webhook_entrega").update({ status: "falhou" }).eq("id", e.id);
      continue;
    }
    const corpo = JSON.stringify(e.payload);
    let ok = false;
    try {
      ok = await comTimeout(async (signal) => {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Assinatura": `sha256=${assinar(ep.secret, corpo)}` },
          body: corpo,
          signal,
        });
        return res.ok;
      });
    } catch {
      ok = false;
    }
    if (ok) {
      await admin.from("webhook_entrega").update({ status: "ok" }).eq("id", e.id);
      entregues += 1;
    } else {
      const tentativas = (e.tentativas as number) + 1;
      const falhou = tentativas >= MAX_TENTATIVAS;
      await admin
        .from("webhook_entrega")
        .update({
          tentativas,
          status: falhou ? "falhou" : "pendente",
          proximo_retry: new Date(Date.now() + proximoRetry(tentativas) * 1000).toISOString(),
        })
        .eq("id", e.id);
      falhas += 1;
    }
  }
  return { entregues, falhas };
}
