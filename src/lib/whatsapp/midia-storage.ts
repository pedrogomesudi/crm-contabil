import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";
import { extensaoPorMime } from "@/lib/whatsapp/inbox";

const MAX_BYTES = 20 * 1024 * 1024;

// Bloqueia hosts internos/privados (SSRF): loopback, link-local (metadata), faixas privadas.
function hostInterno(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal") return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

// Só envia o Client-Token para hosts oficiais do Z-API (evita exfiltração do segredo).
function ehHostZapi(host: string): boolean {
  const h = host.toLowerCase();
  return h === "api.z-api.io" || h.endsWith(".z-api.io");
}

async function baixar(url: string, clientToken: string | null): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null; // só HTTPS
  if (hostInterno(parsed.hostname)) return null; // anti-SSRF
  const headers: Record<string, string> = ehHostZapi(parsed.hostname) && clientToken ? { "Client-Token": clientToken } : {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers, redirect: "error" }); // não segue redirect (anti-SSRF)
    if (!res.ok || !res.body) return null;
    // Enforce o teto lendo em streaming (não confia no content-length).
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Baixa a mídia (Client-Token só para hosts do Z-API) e sobe no bucket 'documentos'.
// Retorna o path salvo ou null em falha. Best-effort.
export async function baixarEStorearMidia(
  admin: ReturnType<typeof createAdminSupabase>,
  url: string,
  mime: string,
  clientToken: string | null,
): Promise<string | null> {
  const buf = await baixar(url, clientToken);
  if (!buf) return null;
  const path = `atendimento/in/${crypto.randomUUID()}.${extensaoPorMime(mime)}`;
  const { error } = await admin.storage.from("documentos").upload(path, buf, { contentType: mime, upsert: false });
  return error ? null : path;
}
