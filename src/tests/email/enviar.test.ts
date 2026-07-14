import { describe, it, expect } from "vitest";
import { payloadResend, payloadSendgrid } from "@/lib/email/payload";

const cfg = { remetenteNome: "Escritório SALDO", remetenteEmail: "contato@saldo.ai" };
const msg = { para: "cliente@x.com", assunto: "Guia", corpo: "Olá\nsegue a guia." };

describe("payload dos provedores", () => {
  it("Resend: remetente com nome, texto e html escapado", () => {
    const p = payloadResend(cfg, msg);
    expect(p.from).toBe("Escritório SALDO <contato@saldo.ai>");
    expect(p.to).toEqual(["cliente@x.com"]);
    expect(p.subject).toBe("Guia");
    expect(p.text).toBe("Olá\nsegue a guia.");
    expect(p.html).toBe("Olá<br>segue a guia.");
    expect(p.attachments).toEqual([]);
  });

  it("SendGrid: personalizations + from + conteúdo em texto e html", () => {
    const p = payloadSendgrid(cfg, msg);
    expect(p.personalizations[0]?.to[0]?.email).toBe("cliente@x.com");
    expect(p.from.email).toBe("contato@saldo.ai");
    expect(p.subject).toBe("Guia");
    expect(p.content.map((c) => c.type)).toEqual(["text/plain", "text/html"]);
  });

  it("anexa em base64 nos dois provedores", () => {
    const anexos = [{ nome: "guia.pdf", conteudo: Buffer.from("PDF"), tipo: "application/pdf" }];
    const b64 = Buffer.from("PDF").toString("base64");
    expect(payloadResend(cfg, { ...msg, anexos }).attachments[0]).toEqual({ filename: "guia.pdf", content: b64 });
    expect(payloadSendgrid(cfg, { ...msg, anexos }).attachments[0]).toEqual({
      filename: "guia.pdf",
      type: "application/pdf",
      content: b64,
    });
  });
});
