import { createHmac, timingSafeEqual } from "node:crypto";
import type { StatusEntrega } from "./inbox";

export type MidiaOficialRecebida = {
  tipo: "image" | "audio" | "document";
  id: string;
  mime: string;
  nome: string | null;
  caption: string;
};

// Valida a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o app secret). Timing-safe.
export function assinaturaOficialOk(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const esperado = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function primeiroValue(payload: unknown): Record<string, unknown> | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const entry = Array.isArray(p.entry) ? (p.entry[0] as Record<string, unknown> | undefined) : undefined;
  const changes =
    entry && Array.isArray(entry.changes) ? (entry.changes[0] as Record<string, unknown> | undefined) : undefined;
  const value = changes?.value;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

// Extrai a primeira mensagem RECEBIDA do payload da Cloud API. Mídia vem como `media id` (não URL):
// o download é do webhook, via baixarEStorearMidiaOficial. Sem id (payload torto) cai no marcador.
export function extrairMensagemOficial(
  payload: unknown,
): { telefone: string; texto: string; wamId: string; midia: MidiaOficialRecebida | null } | null {
  const value = primeiroValue(payload);
  const msgs = value && Array.isArray(value.messages) ? value.messages : null;
  const m = msgs?.[0] as Record<string, unknown> | undefined;
  if (!m) return null;
  const telefone = typeof m.from === "string" ? m.from : "";
  const wamId = typeof m.id === "string" ? m.id : "";
  if (!telefone || !wamId) return null;
  if (m.type === "text") {
    const body = (m.text as { body?: string } | undefined)?.body ?? "";
    return { telefone, texto: body, wamId, midia: null };
  }
  if (m.type === "image" || m.type === "document" || m.type === "audio") {
    const bloco = (m[m.type] ?? {}) as { id?: string; mime_type?: string; filename?: string; caption?: string };
    const caption = typeof bloco.caption === "string" ? bloco.caption : "";
    // Sem id não há como baixar: cai no marcador (comportamento da 2A).
    if (typeof bloco.id !== "string" || !bloco.id) {
      return { telefone, texto: caption || "[mídia]", wamId, midia: null };
    }
    return {
      telefone,
      texto: caption || "[mídia]",
      wamId,
      midia: {
        tipo: m.type,
        id: bloco.id,
        mime: typeof bloco.mime_type === "string" ? bloco.mime_type : "application/octet-stream",
        nome: typeof bloco.filename === "string" ? bloco.filename : null,
        caption,
      },
    };
  }
  return { telefone, texto: "[mensagem não suportada]", wamId, midia: null };
}

// Extrai o status de entrega (o primeiro tipo mapeável) e os ids afetados.
export function extrairStatusOficial(payload: unknown): { status: StatusEntrega; ids: string[] } | null {
  const value = primeiroValue(payload);
  const statuses = value && Array.isArray(value.statuses) ? value.statuses : null;
  if (!statuses || statuses.length === 0) return null;
  const MAPA: Record<"sent" | "delivered" | "read", StatusEntrega> = {
    sent: "ENVIADO",
    delivered: "ENTREGUE",
    read: "LIDO",
  };
  for (const kind of ["read", "delivered", "sent"] as const) {
    const ids = statuses
      .filter((s) => (s as Record<string, unknown>).status === kind)
      .map((s) => (s as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string");
    if (ids.length) return { status: MAPA[kind], ids };
  }
  return null;
}
