import { htmlDoTexto } from "./template";

export type Anexo = { nome: string; conteudo: Buffer; tipo: string };
export type Msg = { para: string; assunto: string; corpo: string; anexos?: Anexo[] };
export type Remetente = { remetenteNome: string; remetenteEmail: string };

// Montagem pura dos payloads — sem rede, para poder testar.
export function payloadResend(cfg: Remetente, msg: Msg) {
  return {
    from: `${cfg.remetenteNome} <${cfg.remetenteEmail}>`,
    to: [msg.para],
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
  return {
    personalizations: [{ to: [{ email: msg.para }] }],
    from: { email: cfg.remetenteEmail, name: cfg.remetenteNome },
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
