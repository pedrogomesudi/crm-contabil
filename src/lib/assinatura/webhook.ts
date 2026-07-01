import { createHmac, timingSafeEqual } from "node:crypto";
import type { EventoAssinatura } from "./tipos";

export function verificarHmac(corpo: string, assinatura: string, segredo: string): boolean {
  if (!assinatura) return false;
  const esperado = createHmac("sha256", segredo).update(corpo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mapeia o evento (nome no header "event") + o corpo (formato legado da Clicksign)
// para uma intenção de atualização. Campos confirmados no E2E do sandbox:
// event.data.signer.email (signatário) e document.key (== clicksign_document_id).
export function mapearEvento(nomeEvento: string, payload: unknown): EventoAssinatura {
  const p = payload as {
    event?: { data?: { signer?: { email?: string } } };
    document?: { key?: string };
  };
  const documentKey = p?.document?.key ?? "";
  const email = p?.event?.data?.signer?.email ?? "";
  if (nomeEvento === "sign" && documentKey && email) return { tipo: "assinou", documentKey, email };
  if (nomeEvento === "refusal" && documentKey && email) return { tipo: "recusou", documentKey, email };
  if ((nomeEvento === "close" || nomeEvento === "auto_close" || nomeEvento === "finished") && documentKey)
    return { tipo: "finalizou", documentKey };
  return { tipo: "ignorar" };
}
