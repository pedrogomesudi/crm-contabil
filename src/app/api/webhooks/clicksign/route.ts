import { NextResponse } from "next/server";
import { required } from "@/lib/env";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { verificarHmac, mapearEvento } from "@/lib/assinatura/webhook";
import { baixarAssinado } from "@/lib/assinatura/clicksign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const corpo = await req.text(); // corpo CRU para o HMAC
  // Clicksign envia o HMAC-SHA256 no header "content-hmac" como "sha256=<hex>".
  const assinatura = (req.headers.get("content-hmac") ?? "").replace(/^sha256=/, "");
  const nomeEvento = req.headers.get("event") ?? "";
  const segredo = required(process.env.CLICKSIGN_HMAC_SECRET, "CLICKSIGN_HMAC_SECRET");
  if (!verificarHmac(corpo, assinatura, segredo)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }
  const ev = mapearEvento(nomeEvento, payload);
  if (ev.tipo === "ignorar") return NextResponse.json({ ok: true });

  const admin = createAdminSupabase();
  const { data: assin } = await admin
    .from("assinaturas")
    .select("id, cliente_id, clicksign_envelope_id, clicksign_document_id, documento_assinado_id, status")
    .eq("clicksign_document_id", ev.documentKey)
    .maybeSingle();
  if (!assin) return NextResponse.json({ ok: true }); // documento não é nosso: ignora

  if (ev.tipo === "assinou") {
    await admin
      .from("assinatura_signatarios")
      .update({ status: "assinado", assinado_em: new Date().toISOString() })
      .eq("assinatura_id", assin.id)
      .eq("email", ev.email)
      .neq("status", "assinado"); // idempotente
    if (assin.status === "enviado") await admin.from("assinaturas").update({ status: "parcial" }).eq("id", assin.id);
  } else if (ev.tipo === "recusou") {
    await admin
      .from("assinatura_signatarios")
      .update({ status: "recusado" })
      .eq("assinatura_id", assin.id)
      .eq("email", ev.email);
    await admin.from("assinaturas").update({ status: "recusado" }).eq("id", assin.id);
  } else if (ev.tipo === "finalizou") {
    if (assin.documento_assinado_id) return NextResponse.json({ ok: true }); // já processado
    const pdf =
      assin.clicksign_envelope_id && assin.clicksign_document_id
        ? await baixarAssinado(assin.clicksign_envelope_id, assin.clicksign_document_id)
        : null;
    let docAssinadoId: string | null = null;
    if (pdf) {
      const caminho = `${assin.cliente_id}/contrato-assinado-${Date.now()}.pdf`;
      const up = await admin.storage.from("documentos").upload(caminho, pdf, { contentType: "application/pdf" });
      if (!up.error) {
        const { data: novo } = await admin
          .from("documentos")
          .insert({
            cliente_id: assin.cliente_id,
            nome: "Contrato assinado.pdf",
            tipo: "Contrato assinado",
            caminho_storage: caminho,
          })
          .select("id")
          .single();
        docAssinadoId = novo?.id ?? null;
      }
    }
    // Envelope fechado => todos assinaram: garante o status dos signatários
    // (robustez contra algum evento "sign" perdido).
    await admin
      .from("assinatura_signatarios")
      .update({ status: "assinado" })
      .eq("assinatura_id", assin.id)
      .eq("status", "pendente");
    await admin
      .from("assinaturas")
      .update({
        status: "finalizado",
        finalizado_em: new Date().toISOString(),
        documento_assinado_id: docAssinadoId,
      })
      .eq("id", assin.id);
  }

  return NextResponse.json({ ok: true });
}
