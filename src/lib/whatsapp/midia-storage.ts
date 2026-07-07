import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";
import { extensaoPorMime } from "@/lib/whatsapp/inbox";

const MAX_BYTES = 20 * 1024 * 1024;

async function baixar(url: string, clientToken: string | null): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    let res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok && clientToken && /z-?api/i.test(url)) {
      res = await fetch(url, { signal: ctrl.signal, headers: { "Client-Token": clientToken } });
    }
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Baixa a mídia (com Client-Token se for host do Z-API) e sobe no bucket 'documentos'.
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
