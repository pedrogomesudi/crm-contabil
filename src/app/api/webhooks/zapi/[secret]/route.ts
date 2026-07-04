import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { extrairMensagemZapi } from "@/lib/whatsapp/inbox";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";

function segredoOk(recebido: string): boolean {
  const esperado = process.env.ZAPI_WEBHOOK_SECRET;
  if (!esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!segredoOk(secret)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const payload = await req.json().catch(() => null);
  const msg = extrairMensagemZapi(payload);
  if (!msg) return NextResponse.json({ ok: true, ignored: true });

  const tel = normalizarTelefone(msg.telefone) ?? msg.telefone.replace(/\D/g, "");
  const admin = createAdminSupabase();

  // resolve cliente por telefone (best-effort): só casa se houver EXATAMENTE um
  const { data: casadosRaw } = await admin.from("clientes").select("id, telefone");
  const casados = (casadosRaw ?? []).filter((c) => normalizarTelefone((c.telefone as string) ?? "") === tel);
  const clienteId = casados.length === 1 ? (casados[0]!.id as string) : null;

  // dedup pelo unique (z_message_id); ignora violação
  const { error } = await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId,
    telefone: tel,
    texto: msg.texto,
    status: "RECEBIDO",
    direcao: "IN",
    lida: false,
    z_message_id: msg.zId,
  });
  if (error && !String(error.message).includes("duplicate")) {
    console.error("webhook zapi:", error.message);
  }
  return NextResponse.json({ ok: true });
}
