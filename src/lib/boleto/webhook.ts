export type StatusWebhook = "ok" | "divergente" | "ausente";

export function urlWebhookEsperada(appUrl: string, secret: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/api/webhooks/boleto/${secret}`;
}

export function verdictWebhook(registrada: string | null, esperada: string): StatusWebhook {
  if (!registrada) return "ausente";
  return registrada === esperada ? "ok" : "divergente";
}
