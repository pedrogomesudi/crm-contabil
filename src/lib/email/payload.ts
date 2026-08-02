import { htmlDoTexto } from "./template";

export type Anexo = { nome: string; conteudo: Buffer; tipo: string };
export type Msg = { para: string; assunto: string; corpo: string; anexos?: Anexo[] };
export type Remetente = { remetenteNome: string; remetenteEmail: string; responderPara?: string };

// Só emite reply_to quando difere do remetente: apontar a resposta para o próprio
// endereço de envio é redundante e alguns provedores implicam com isso.
function replyToDe(cfg: Remetente): string | undefined {
  const r = cfg.responderPara?.trim();
  return r && r.toLowerCase() !== cfg.remetenteEmail.toLowerCase() ? r : undefined;
}

// Montagem pura dos payloads — sem rede, para poder testar.
export function payloadResend(cfg: Remetente, msg: Msg) {
  const replyTo = replyToDe(cfg);
  return {
    from: `${cfg.remetenteNome} <${cfg.remetenteEmail}>`,
    to: [msg.para],
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: msg.assunto,
    text: msg.corpo,
    html: htmlDoTexto(msg.corpo),
    attachments: (msg.anexos ?? []).map((a) => ({
      filename: a.nome,
      content: a.conteudo.toString("base64"),
    })),
  };
}

export function payloadSendgrid(cfg: Remetente, msg: Msg) {
  const replyTo = replyToDe(cfg);
  return {
    personalizations: [{ to: [{ email: msg.para }] }],
    from: { email: cfg.remetenteEmail, name: cfg.remetenteNome },
    ...(replyTo ? { reply_to: { email: replyTo } } : {}),
    subject: msg.assunto,
    content: [
      { type: "text/plain", value: msg.corpo },
      { type: "text/html", value: htmlDoTexto(msg.corpo) },
    ],
    attachments: (msg.anexos ?? []).map((a) => ({
      filename: a.nome,
      type: a.tipo,
      content: a.conteudo.toString("base64"),
    })),
  };
}
