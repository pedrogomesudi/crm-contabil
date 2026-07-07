import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { extrairMensagemZapi, extrairStatusZapi } from "@/lib/whatsapp/inbox";
import { normalizarTelefone } from "@/lib/whatsapp/mensagem";
import { decifrar } from "@/lib/nfse/cripto";
import { baixarEStorearMidia } from "@/lib/whatsapp/midia-storage";

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
  if (!msg) {
    const ev = extrairStatusZapi(payload);
    if (ev) {
      // Só AVANÇA o estado (nunca rebaixa; tolera ordem invertida via lista de anteriores).
      const anteriores = ev.status === "ENTREGUE" ? ["ENVIADO"] : ev.status === "LIDO" ? ["ENVIADO", "ENTREGUE"] : [];
      if (anteriores.length) {
        const admin = createAdminSupabase();
        await admin
          .from("whatsapp_mensagem")
          .update({ status: ev.status })
          .in("z_message_id", ev.ids)
          .eq("direcao", "OUT")
          .in("status", anteriores);
      }
      return NextResponse.json({ ok: true, status: ev.status });
    }
    // Instrumentação temporária: captura payloads de status desconhecidos p/ calibrar o parser.
    const p = (payload ?? {}) as Record<string, unknown>;
    if (p.status) console.log("zapi status payload:", JSON.stringify(payload).slice(0, 400));
    return NextResponse.json({ ok: true, ignored: true });
  }

  const tel = normalizarTelefone(msg.telefone) ?? msg.telefone.replace(/\D/g, "");
  const admin = createAdminSupabase();

  // resolve cliente por telefone (best-effort): só casa se houver EXATAMENTE um
  const { data: casadosRaw } = await admin.from("clientes").select("id, telefone");
  const casados = (casadosRaw ?? []).filter((c) => normalizarTelefone((c.telefone as string) ?? "") === tel);
  const clienteId = casados.length === 1 ? (casados[0]!.id as string) : null;

  // dedup pelo unique (z_message_id); ignora violação
  if (msg.midia) {
    // Client-Token best-effort (algumas URLs do Z-API exigem o header).
    let clientToken: string | null = null;
    const chave = process.env.WHATSAPP_CRIPTO_KEY;
    if (chave) {
      const { data: cfg } = await admin.from("whatsapp_config").select("client_token_cifrado").eq("id", 1).maybeSingle();
      if (cfg?.client_token_cifrado) {
        try {
          clientToken = decifrar(cfg.client_token_cifrado, chave).toString("utf8");
        } catch {
          clientToken = null;
        }
      }
    }
    const path = await baixarEStorearMidia(admin, msg.midia.url, msg.midia.mime, clientToken);
    const marcador = `[${msg.midia.tipo}${msg.midia.nome ? ": " + msg.midia.nome : ""}]`;
    const { error } = await admin.from("whatsapp_mensagem").insert({
      cliente_id: clienteId,
      telefone: tel,
      texto: path ? msg.midia.caption : marcador,
      status: "RECEBIDO",
      direcao: "IN",
      lida: false,
      z_message_id: msg.zId,
      midia_tipo: path ? msg.midia.tipo : null,
      midia_path: path,
      midia_nome: msg.midia.nome,
      midia_mime: msg.midia.mime,
    });
    if (error && !String(error.message).includes("duplicate")) console.error("webhook zapi midia:", error.message);
    if (!path) console.log("zapi midia payload:", JSON.stringify(payload).slice(0, 400));
    return NextResponse.json({ ok: true });
  }

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
