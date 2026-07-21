import { createHmac } from "node:crypto";

export function assinar(secret: string, corpo: string): string {
  return createHmac("sha256", secret).update(corpo).digest("hex");
}

// Backoff exponencial (segundos), com teto de 1h. tentativas começa em 1.
export function proximoRetry(tentativas: number): number {
  const escala = [60, 300, 1800, 3600];
  return escala[Math.min(tentativas, escala.length) - 1] ?? 3600;
}

export type EndpointRoteavel = { id: string; eventos: string[]; ativo: boolean };
export function endpointsParaEvento<T extends EndpointRoteavel>(endpoints: T[], evento: string): T[] {
  return endpoints.filter((e) => e.ativo && e.eventos.includes(evento));
}

export const EVENTOS_WEBHOOK = [
  "cliente.criado",
  "cliente.atualizado",
  "titulo.criado",
  "titulo.pago",
  "obrigacao.entregue",
  "documento.enviado",
] as const;
