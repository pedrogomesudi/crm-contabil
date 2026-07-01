import { createHmac, timingSafeEqual } from "node:crypto";
import type { EventoAssinatura } from "./tipos";

export function verificarHmac(corpo: string, assinatura: string, segredo: string): boolean {
  if (!assinatura) return false;
  const esperado = createHmac("sha256", segredo).update(corpo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mapeia o payload do webhook para uma intenção de atualização. O caminho exato
// dos campos é confirmado no E2E (sandbox); qualquer ajuste fica isolado aqui.
export function mapearEvento(payload: unknown): EventoAssinatura {
  const p = payload as {
    event?: { name?: string; data?: { signer?: { email?: string } } };
    envelope?: { id?: string };
  };
  const nome = p?.event?.name;
  const envelopeId = p?.envelope?.id ?? "";
  const email = p?.event?.data?.signer?.email ?? "";
  if (nome === "sign" && envelopeId && email) return { tipo: "assinou", envelopeId, email };
  if (nome === "refusal" && envelopeId && email) return { tipo: "recusou", envelopeId, email };
  if ((nome === "close" || nome === "auto_close" || nome === "finished") && envelopeId)
    return { tipo: "finalizou", envelopeId };
  return { tipo: "ignorar" };
}
