import "server-only";
import nodemailer from "nodemailer";
import { carregarConfig, type ConfigEmail } from "./config";
import { htmlDoTexto } from "./template";
import { payloadResend, payloadSendgrid, type Msg } from "./payload";

export type Resultado = { ok: true } | { ok: false; erro: string };
export type { Anexo, Msg } from "./payload";

async function viaApi(cfg: ConfigEmail, api: NonNullable<ConfigEmail["api"]>, msg: Msg): Promise<Resultado> {
  const url =
    api.provedor === "resend" ? "https://api.resend.com/emails" : "https://api.sendgrid.com/v3/mail/send";
  const body = api.provedor === "resend" ? payloadResend(cfg, msg) : payloadSendgrid(cfg, msg);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${api.chave}` },
      body: JSON.stringify(body),
    });
    if (r.ok) return { ok: true };
    const txt = await r.text().catch(() => "");
    return { ok: false, erro: `Provedor recusou (${r.status}): ${txt.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message.slice(0, 300) : "Falha no envio." };
  }
}

async function viaSmtp(cfg: ConfigEmail, smtp: NonNullable<ConfigEmail["smtp"]>, msg: Msg): Promise<Resultado> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.porta,
    // 465 é TLS implícito; 587 fala STARTTLS e precisa de `secure: false`.
    secure: smtp.seguro && smtp.porta === 465,
    auth: smtp.usuario ? { user: smtp.usuario, pass: smtp.senha } : undefined,
  });
  try {
    await transport.sendMail({
      from: `${cfg.remetenteNome} <${cfg.remetenteEmail}>`,
      to: msg.para,
      subject: msg.assunto,
      text: msg.corpo,
      html: htmlDoTexto(msg.corpo),
      attachments: (msg.anexos ?? []).map((a) => ({
        filename: a.nome,
        content: a.conteudo,
        contentType: a.tipo,
      })),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message.slice(0, 300) : "Falha no envio." };
  }
}

export async function enviarEmail(msg: Msg): Promise<Resultado> {
  const cfg = await carregarConfig();
  if ("erro" in cfg) return { ok: false, erro: cfg.erro };
  if (cfg.provedor === "smtp" && cfg.smtp) return viaSmtp(cfg, cfg.smtp, msg);
  if (cfg.provedor === "api" && cfg.api) return viaApi(cfg, cfg.api, msg);
  return { ok: false, erro: "E-mail não configurado." };
}
