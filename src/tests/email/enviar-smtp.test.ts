import { describe, it, expect, vi, beforeEach } from "vitest";

// O caminho SMTP é o que roda em produção (relay do Brevo), e era o único sem teste: o
// enviar.test.ts cobre só os payloads de Resend e SendGrid, provedores que não estão em uso.
// A lacuna apareceu ao subir o nodemailer de 9 para 10 (bump de major por CVE) — nada no CI
// teria acusado uma quebra na composição da mensagem.
type Opcoes = Record<string, unknown>;
// Os tipos vão no genérico do vi.fn, e não como parâmetros da implementação: sem eles o
// `mock.calls` é inferido como tupla vazia e o tsc recusa ler `calls[0][0]`.
const sendMail = vi.fn<(msg: Opcoes) => Promise<{ messageId: string }>>(async () => ({ messageId: "<id@teste>" }));
const createTransport = vi.fn<(transporte: Opcoes) => { sendMail: typeof sendMail }>(() => ({ sendMail }));

vi.mock("nodemailer", () => ({ default: { createTransport } }));

const cfgBase = {
  provedor: "smtp" as const,
  remetenteNome: "Escritório SALDO",
  remetenteEmail: "contato@saldo.ai",
  smtp: { host: "smtp-relay.brevo.com", porta: 587, seguro: true, usuario: "u", senha: "s" },
};
let cfgAtual: Record<string, unknown> = cfgBase;

vi.mock("@/lib/email/config", () => ({ carregarConfig: async () => cfgAtual }));

const { enviarEmail } = await import("@/lib/email/enviar");

const opcoes = (): Opcoes => sendMail.mock.calls[0]![0];
const transporte = (): Opcoes => createTransport.mock.calls[0]![0];

beforeEach(() => {
  sendMail.mockClear();
  createTransport.mockClear();
  cfgAtual = cfgBase;
});

describe("envio por SMTP", () => {
  it("compõe remetente, destinatário, assunto, texto e html", async () => {
    const r = await enviarEmail({ para: "cliente@x.com", assunto: "Guia", corpo: "Olá\nsegue." });
    expect(r).toEqual({ ok: true });
    const o = opcoes();
    expect(o.from).toBe("Escritório SALDO <contato@saldo.ai>");
    expect(o.to).toBe("cliente@x.com");
    expect(o.subject).toBe("Guia");
    expect(o.text).toBe("Olá\nsegue.");
    expect(o.html).toBe("Olá<br>segue.");
  });

  it("anexo vai como content/contentType, não como path ou href", async () => {
    const conteudo = Buffer.from("PDF");
    await enviarEmail({
      para: "cliente@x.com",
      assunto: "Boleto",
      corpo: "segue",
      anexos: [{ nome: "boleto.pdf", conteudo, tipo: "application/pdf" }],
    });
    // O nodemailer 10 passou a validar o certificado TLS ao buscar anexo por href/path. Mandar
    // o buffer mantém o envio fora dessa rota — e é o que o sistema sempre fez.
    const anexo = (opcoes().attachments as unknown[])[0];
    expect(anexo).toEqual({ filename: "boleto.pdf", content: conteudo, contentType: "application/pdf" });
  });

  it("587 fala STARTTLS: secure precisa ser false mesmo com 'seguro' ligado", async () => {
    await enviarEmail({ para: "cliente@x.com", assunto: "a", corpo: "b" });
    expect(transporte()).toMatchObject({ port: 587, secure: false });
  });

  it("465 é TLS implícito: secure true", async () => {
    cfgAtual = { ...cfgBase, smtp: { ...cfgBase.smtp, porta: 465 } };
    await enviarEmail({ para: "cliente@x.com", assunto: "a", corpo: "b" });
    expect(transporte()).toMatchObject({ port: 465, secure: true });
  });
});

// A cópia oculta vai em TODA mensagem do sistema. Se ela parar de ser emitida, o escritório
// perde o arquivo sem nenhum sinal; se for emitida para quem já é o destinatário, o cliente
// recebe a mesma mensagem duas vezes.
describe("cópia oculta no SMTP", () => {
  it("entra como bcc quando configurada", async () => {
    cfgAtual = { ...cfgBase, copiaOculta: "contato@assessoriaelevare.com.br" };
    await enviarEmail({ para: "cliente@x.com", assunto: "a", corpo: "b" });
    expect(opcoes().bcc).toBe("contato@assessoriaelevare.com.br");
  });

  it("não vai quando é o próprio destinatário, ignorando caixa e espaços", async () => {
    cfgAtual = { ...cfgBase, copiaOculta: "contato@assessoriaelevare.com.br" };
    await enviarEmail({ para: "  CONTATO@assessoriaelevare.com.br ", assunto: "a", corpo: "b" });
    expect("bcc" in opcoes()).toBe(false);
  });

  it("sem copiaOculta, nenhum bcc é emitido", async () => {
    await enviarEmail({ para: "cliente@x.com", assunto: "a", corpo: "b" });
    expect("bcc" in opcoes()).toBe(false);
  });
});
