import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { interpretarWebhookAsaas } from "@/lib/boleto/asaas";
import { interpretarWebhookInter } from "@/lib/boleto/inter";
import { dadosBaixaBoleto } from "@/lib/boleto/baixa";

function segredoOk(recebido: string): boolean {
  const esperado = process.env.BOLETO_WEBHOOK_SECRET;
  if (!esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!segredoOk(secret)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const admin = createAdminSupabase();
  const { data: cfg } = await admin.from("boleto_config").select("provedor, conta_bancaria_id").eq("id", 1).maybeSingle();
  if (!cfg || cfg.provedor === "nenhum") return NextResponse.json({ ok: true, motivo: "sem provedor" });
  const interpretar = cfg.provedor === "asaas" ? interpretarWebhookAsaas : interpretarWebhookInter;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const eventos = Array.isArray(body) ? body : [body];
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let baixados = 0;

  for (const ev of eventos) {
    const evento = interpretar(ev);
    if (!evento || !evento.pago) continue;
    const { data: bol } = await admin.from("boleto").select("id, titulo_id, valor, status").eq("provedor_boleto_id", evento.provedorBoletoId).maybeSingle();
    if (!bol || bol.status === "pago" || bol.status === "cancelado") continue;
    if (!cfg.conta_bancaria_id) continue;
    const d = dadosBaixaBoleto(evento, Number(bol.valor), hoje);
    const { error: eBaixa } = await admin.from("baixa").insert({
      titulo_id: bol.titulo_id, data_recebimento: d.dataRecebimento, valor_recebido: d.valorRecebido,
      conta_bancaria_id: cfg.conta_bancaria_id, forma_pagamento: "BOLETO",
    });
    if (eBaixa) continue;
    await admin.from("boleto").update({ status: "pago", atualizado_em: new Date().toISOString() }).eq("id", bol.id);
    baixados++;
  }
  return NextResponse.json({ ok: true, baixados });
}
