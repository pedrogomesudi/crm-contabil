import { htmlDoTexto } from "./template";

export type Anexo = { nome: string; conteudo: Buffer; tipo: string };
export type Msg = { para: string; assunto: string; corpo: string; anexos?: Anexo[] };
export type Remetente = {
  remetenteNome: string;
  remetenteEmail: string;
  responderPara?: string;
  copiaOculta?: string;
};

// Só emite reply_to quando difere do remetente: apontar a resposta para o próprio
// endereço de envio é redundante e alguns provedores implicam com isso.
function replyToDe(cfg: Remetente): string | undefined {
  const r = cfg.responderPara?.trim();
  return r && r.toLowerCase() !== cfg.remetenteEmail.toLowerCase() ? r : undefined;
}

// Cópia oculta de arquivo: toda mensagem enviada pelo sistema vai também para este endereço.
// Omitido quando vazio (provedor implica com bcc vazio) e quando é o PRÓPRIO destinatário —
// nesse caso a pessoa receberia a mesma mensagem duas vezes.
function bccDe(cfg: Remetente, para: string): string | undefined {
  const b = cfg.copiaOculta?.trim();
  return b && b.toLowerCase() !== para.trim().toLowerCase() ? b : undefined;
}

// Montagem pura dos payloads — sem rede, para poder testar.
export function payloadResend(cfg: Remetente, msg: Msg) {
  const replyTo = replyToDe(cfg);
  const bcc = bccDe(cfg, msg.para);
  return {
    from: `${cfg.remetenteNome} <${cfg.remetenteEmail}>`,
    to: [msg.para],
    ...(bcc ? { bcc: [bcc] } : {}),
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
  const bcc = bccDe(cfg, msg.para);
  return {
    personalizations: [{ to: [{ email: msg.para }], ...(bcc ? { bcc: [{ email: bcc }] } : {}) }],
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
