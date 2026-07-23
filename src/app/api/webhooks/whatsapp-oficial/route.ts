import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { assinaturaOficialOk, extrairMensagemOficial, extrairStatusOficial } from "@/lib/whatsapp/inbox-oficial";
import { chaveTelefone, chaveDeNumeroCompleto } from "@/lib/whatsapp/mensagem";
import { baixarEStorearMidiaOficial } from "@/lib/whatsapp/midia-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Verificação do webhook (Meta chama uma vez ao cadastrar).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const admin = createAdminSupabase();
  const { data } = await admin.from("whatsapp_config").select("oficial_verify_token").eq("id", 1).maybeSingle();
  const esperado = (data?.oficial_verify_token as string | null) ?? null;
  if (mode === "subscribe" && esperado && token === esperado && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const admin = createAdminSupabase();
  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("oficial_app_secret_cifrado, oficial_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.oficial_app_secret_cifrado) return NextResponse.json({ erro: "não configurado" }, { status: 401 });
  let appSecret: string;
  try {
    appSecret = (await decifrarDominio("whatsapp", cfg.oficial_app_secret_cifrado as string)).toString("utf8");
  } catch {
    return NextResponse.json({ erro: "cripto" }, { status: 401 });
  }
  if (!assinaturaOficialOk(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Status de entrega: só AVANÇA o estado (nunca rebaixa).
  const ev = extrairStatusOficial(payload);
  if (ev) {
    const anteriores = ev.status === "ENTREGUE" ? ["ENVIADO"] : ev.status === "LIDO" ? ["ENVIADO", "ENTREGUE"] : [];
    if (anteriores.length) {
      await admin
        .from("whatsapp_mensagem")
        .update({ status: ev.status })
        .in("z_message_id", ev.ids)
        .eq("direcao", "OUT")
        .in("status", anteriores);
    }
    return NextResponse.json({ ok: true, status: ev.status });
  }

  const msg = extrairMensagemOficial(payload);
  if (!msg) return NextResponse.json({ ok: true, ignored: true });

  // msg.telefone já vem completo com DDI (Cloud API) — canonicaliza sem colar 55.
  const tel = chaveDeNumeroCompleto(msg.telefone) ?? msg.telefone.replace(/\D/g, "");

  // resolve cliente por telefone (best-effort): só casa se houver EXATAMENTE um.
  const { data: casadosRaw } = await admin.from("clientes").select("id, telefone, telefone_ddi");
  const casados = (casadosRaw ?? []).filter(
    (c) => chaveTelefone((c.telefone as string) ?? "", (c.telefone_ddi as string) ?? "55") === tel,
  );
  const clienteId = casados.length === 1 ? (casados[0]!.id as string) : null;

  // Mídia (Fatia 2B): baixa pelo media id com o token oficial. Best-effort — se falhar, a
  // mensagem entra sem anexo (o texto/caption preserva o contexto).
  let midiaPath: string | null = null;
  let midiaMime: string | null = null;
  if (msg.midia && cfg.oficial_token_cifrado) {
    try {
      const token = (await decifrarDominio("whatsapp", cfg.oficial_token_cifrado as string)).toString("utf8");
      const salvo = await baixarEStorearMidiaOficial(admin, msg.midia.id, token);
      if (salvo) {
        midiaPath = salvo.path;
        midiaMime = salvo.mime;
      }
    } catch {
      // cripto indisponível: segue sem anexo
    }
  }

  const { error } = await admin.from("whatsapp_mensagem").insert({
    cliente_id: clienteId,
    telefone: tel,
    texto: msg.texto,
    status: "RECEBIDO",
    direcao: "IN",
    lida: false,
    z_message_id: msg.wamId,
    midia_tipo: midiaPath ? msg.midia?.tipo : null,
    midia_path: midiaPath,
    midia_nome: msg.midia?.nome ?? null,
    midia_mime: midiaPath ? (midiaMime ?? msg.midia?.mime ?? null) : null,
  });
  if (error && !String(error.message).includes("duplicate")) console.error("webhook oficial:", error.message);
  await admin.from("conversa").update({ status: "aberta" }).eq("telefone", tel).eq("status", "finalizada");
  return NextResponse.json({ ok: true });
}
