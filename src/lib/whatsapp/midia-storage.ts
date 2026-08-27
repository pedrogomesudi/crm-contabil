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

// Só envia o Bearer para hosts oficiais da Meta (evita exfiltração do token), no mesmo
// espírito do Client-Token restrito ao Z-API. Exportada para teste.
export function ehHostMeta(host: string): boolean {
  const h = host.toLowerCase();
  return h === "graph.facebook.com" || h.endsWith(".fbcdn.net") || h.endsWith(".fbsbx.com");
}

// O download com todas as proteções (HTTPS, anti-SSRF, teto em streaming, timeout). Segue
// redirects MANUALMENTE — a mídia do WhatsApp costuma vir por CDN que redireciona (Z-API e Meta);
// com `redirect: "error"` qualquer 3xx quebrava o download e a mídia sumia. A cada salto o host é
// revalidado (anti-SSRF preservado) e os headers são RECALCULADOS por host via `headersPara`, para
// o segredo (Client-Token / Bearer) só ir ao host a que pertence, nunca a um CDN de terceiro.
async function baixarSeguindoRedirects(
  urlInicial: string,
  headersPara: (host: string) => Record<string, string>,
): Promise<Buffer | null> {
  let url = urlInicial;
  for (let salto = 0; salto < 5; salto++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:") return null; // só HTTPS
    if (hostInterno(parsed.hostname)) return null; // anti-SSRF (revalidado a cada salto)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: headersPara(parsed.hostname),
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        url = new URL(loc, url).toString(); // o destino é validado no próximo giro do laço
        continue;
      }
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
  return null; // redirects demais
}

// Z-API: o Client-Token só vai para hosts do próprio Z-API (mesmo após redirect).
async function baixar(url: string, clientToken: string | null): Promise<Buffer | null> {
  return baixarSeguindoRedirects(
    url,
    (host): Record<string, string> => (ehHostZapi(host) && clientToken ? { "Client-Token": clientToken } : {}),
  );
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

// Cloud API (oficial): a mídia vem como `media id`. Resolve id → URL assinada → bytes (as duas
// chamadas exigem o Bearer) e sobe no MESMO destino do Z-API. Best-effort: null em qualquer falha.
export async function baixarEStorearMidiaOficial(
  admin: ReturnType<typeof createAdminSupabase>,
  mediaId: string,
  token: string,
): Promise<{ path: string; mime: string } | null> {
  const auth = { Authorization: `Bearer ${token}` };
  // O Bearer só vai para hosts da Meta (revalidado a cada salto de redirect).
  const headersMeta = (host: string): Record<string, string> => (ehHostMeta(host) ? auth : {});
  // 1) media id → { url, mime_type }
  const metaBuf = await baixarSeguindoRedirects(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`,
    headersMeta,
  );
  if (!metaBuf) return null;
  let url: string;
  let mime: string;
  try {
    const j = JSON.parse(metaBuf.toString("utf8")) as { url?: string; mime_type?: string };
    if (typeof j.url !== "string") return null;
    url = j.url;
    mime = typeof j.mime_type === "string" ? j.mime_type : "application/octet-stream";
  } catch {
    return null;
  }
  // 2) a URL assinada também exige o Bearer — e só pode ser um host da Meta.
  let hostOk = false;
  try {
    hostOk = ehHostMeta(new URL(url).hostname);
  } catch {
    return null;
  }
  if (!hostOk) return null;
  const bytes = await baixarSeguindoRedirects(url, headersMeta);
  if (!bytes) return null;
  // 3) mesmo destino do Z-API
  const path = `atendimento/in/${crypto.randomUUID()}.${extensaoPorMime(mime)}`;
  const { error } = await admin.storage.from("documentos").upload(path, bytes, { contentType: mime, upsert: false });
  return error ? null : { path, mime };
}
