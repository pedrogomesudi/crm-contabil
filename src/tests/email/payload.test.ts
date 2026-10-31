import { describe, it, expect } from "vitest";
import { payloadResend, payloadSendgrid } from "@/lib/email/payload";

describe("cópia oculta", () => {
  const base = { remetenteNome: "SALDO", remetenteEmail: "contato@escritorio.com.br" };
  const msg = { para: "cliente@exemplo.com", assunto: "Nota", corpo: "segue" };

  it("Resend recebe o bcc quando configurado", () => {
    expect(payloadResend({ ...base, copiaOculta: "arquivo@escritorio.com.br" }, msg)).toMatchObject({
      bcc: ["arquivo@escritorio.com.br"],
    });
  });

  it("SendGrid recebe o bcc na personalização do destinatário", () => {
    const p = payloadSendgrid({ ...base, copiaOculta: "arquivo@escritorio.com.br" }, msg);
    expect(p.personalizations[0]).toMatchObject({ bcc: [{ email: "arquivo@escritorio.com.br" }] });
  });

  it("sem cópia configurada, o campo não é emitido — alguns provedores implicam com bcc vazio", () => {
    expect(payloadResend(base, msg)).not.toHaveProperty("bcc");
    expect(payloadSendgrid(base, msg).personalizations[0]).not.toHaveProperty("bcc");
    expect(payloadResend({ ...base, copiaOculta: "   " }, msg)).not.toHaveProperty("bcc");
  });

  it("não copia quando o endereço é o próprio destinatário — seria a mesma mensagem duas vezes", () => {
    const m = { ...msg, para: "arquivo@escritorio.com.br" };
    expect(payloadResend({ ...base, copiaOculta: "Arquivo@Escritorio.com.br" }, m)).not.toHaveProperty("bcc");
    expect(
      payloadSendgrid({ ...base, copiaOculta: "arquivo@escritorio.com.br" }, m).personalizations[0],
    ).not.toHaveProperty("bcc");
  });

  it("convive com o responder-para, que é outro papel", () => {
    const p = payloadResend(
      { ...base, responderPara: "resposta@escritorio.com.br", copiaOculta: "arquivo@escritorio.com.br" },
      msg,
    );
    expect(p).toMatchObject({ reply_to: "resposta@escritorio.com.br", bcc: ["arquivo@escritorio.com.br"] });
  });
});
