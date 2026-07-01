import { createHmac, timingSafeEqual } from "node:crypto";
import type { EventoAssinatura } from "./tipos";

export function verificarHmac(corpo: string, assinatura: string, segredo: string): boolean {
  if (!assinatura) return false;
  const esperado = createHmac("sha256", segredo).update(corpo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mapeia o corpo (formato legado da Clicksign) para uma intenção de atualização.
// O nome do evento é lido do CORPO (`event.name`), que está sob o HMAC — nunca de
// um header não assinado (senão o tipo de ação seria forjável por replay).
// Campos confirmados no E2E do sandbox: event.data.signer.email e document.key
// (== nosso clicksign_document_id). E-mail normalizado (lowercase) para casar.
export function mapearEvento(payload: unknown): EventoAssinatura {
  const p = payload as {
    event?: { name?: string; data?: { signer?: { email?: string } } };
    document?: { key?: string };
  };
  const nome = p?.event?.name;
  const documentKey = p?.document?.key ?? "";
  const email = (p?.event?.data?.signer?.email ?? "").trim().toLowerCase();
  if (nome === "sign" && documentKey && email) return { tipo: "assinou", documentKey, email };
  if (nome === "refusal" && documentKey && email) return { tipo: "recusou", documentKey, email };
  if ((nome === "close" || nome === "auto_close" || nome === "finished") && documentKey)
    return { tipo: "finalizou", documentKey };
  return { tipo: "ignorar" };
}
