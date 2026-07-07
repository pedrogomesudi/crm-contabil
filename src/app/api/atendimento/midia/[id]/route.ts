import { NextResponse } from "next/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeAtender } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Tipos seguros para renderizar inline (mesmo servidos do nosso domínio). Qualquer outro
// (text/html, image/svg+xml, etc.) é forçado a download — evita stored-XSS via Content-Type.
const INLINE_SEGURO = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "application/pdf",
]);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeAtender(perfil.papel)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  // RLS garante que só retorna a mensagem se o usuário a vê.
  const supabase = await createServerSupabase();
  const { data: msg } = await supabase
    .from("whatsapp_mensagem")
    .select("midia_path, midia_mime, midia_nome")
    .eq("id", id)
    .maybeSingle();
  if (!msg?.midia_path) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const admin = createAdminSupabase();
  const { data: arquivo, error } = await admin.storage.from("documentos").download(msg.midia_path as string);
  if (error || !arquivo) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  const buf = Buffer.from(await arquivo.arrayBuffer());

  const mime = ((msg.midia_mime as string) ?? "").toLowerCase();
  const seguro = INLINE_SEGURO.has(mime);
  const nome = msg.midia_nome ? String(msg.midia_nome).replace(/[\r\n"]/g, "") : "arquivo";
  const headers: Record<string, string> = {
    "Content-Type": seguro ? mime : "application/octet-stream",
    "Content-Disposition": `${seguro ? "inline" : "attachment"}; filename="${nome}"`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  return new NextResponse(buf, { status: 200, headers });
}
