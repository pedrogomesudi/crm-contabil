import { assinar } from "./sinal";

export type Envelope = { id: string; evento: string; criado_em: string; dados: unknown };

export function montarEnvelope(e: { id: string; evento: string; criado_em: string; payload: unknown }): Envelope {
  const p = (e.payload ?? {}) as { dados?: unknown };
  return { id: e.id, evento: e.evento, criado_em: e.criado_em, dados: p.dados ?? null };
}

export function montarCabecalhos(
  corpo: string,
  secret: string,
  env: Envelope,
  tentativa: number,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Assinatura": `sha256=${assinar(secret, corpo)}`,
    "X-Webhook-Id": env.id,
    "X-Webhook-Timestamp": env.criado_em,
    "X-Webhook-Tentativa": String(tentativa),
  };
}

const comTimeout = async <T>(fn: (s: AbortSignal) => Promise<T>): Promise<T> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
};

export async function enviarWebhook(
  url: string,
  secret: string,
  env: Envelope,
  tentativa: number,
): Promise<{ ok: boolean; status?: number; erro?: string }> {
  const corpo = JSON.stringify(env);
  try {
    return await comTimeout(async (signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: montarCabecalhos(corpo, secret, env, tentativa),
        body: corpo,
        signal,
      });
      return { ok: res.ok, status: res.status };
    });
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.name === "AbortError" ? "Tempo esgotado." : "Erro de rede." };
  }
}
