import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { assinaturaOficialOk, extrairMensagemOficial, extrairStatusOficial } from "@/lib/whatsapp/inbox-oficial";

function payloadMsg(msg: Record<string, unknown>) {
  return { entry: [{ changes: [{ value: { messages: [msg] } }] }] };
}
function payloadStatus(statuses: Record<string, unknown>[]) {
  return { entry: [{ changes: [{ value: { statuses } }] }] };
}

describe("assinaturaOficialOk", () => {
  const raw = JSON.stringify({ a: 1 });
  const secret = "sec";
  const assinatura = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

  it("aceita a assinatura correta", () => {
    expect(assinaturaOficialOk(raw, assinatura, secret)).toBe(true);
  });
  it("rejeita assinatura errada, ausente ou malformada", () => {
    expect(assinaturaOficialOk(raw, "sha256=deadbeef", secret)).toBe(false);
    expect(assinaturaOficialOk(raw, null, secret)).toBe(false);
    expect(assinaturaOficialOk(raw, "md5=x", secret)).toBe(false);
    expect(assinaturaOficialOk(raw + "x", assinatura, secret)).toBe(false);
  });
});

describe("extrairMensagemOficial", () => {
  it("extrai texto (from/id/body)", () => {
    const m = extrairMensagemOficial(
      payloadMsg({ from: "5511999999999", id: "wamid.X", type: "text", text: { body: "oi" } }),
    );
    expect(m).toMatchObject({ telefone: "5511999999999", texto: "oi", wamId: "wamid.X", midia: null });
  });
  it("mídia sem caption mantém o marcador como texto, mas traz a mídia (2B)", () => {
    const m = extrairMensagemOficial(
      payloadMsg({ from: "5511", id: "wamid.Y", type: "image", image: { id: "MID", mime_type: "image/png" } }),
    );
    expect(m?.texto).toBe("[mídia]");
    expect(m?.midia).toEqual({ tipo: "image", id: "MID", mime: "image/png", nome: null, caption: "" });
  });
  it("sem mensagem → null", () => {
    expect(extrairMensagemOficial(payloadStatus([{ id: "x", status: "sent" }]))).toBeNull();
    expect(extrairMensagemOficial({})).toBeNull();
  });

  it("extrai imagem com caption (a caption vira o texto)", () => {
    const p = payloadMsg({
      from: "5511999999999",
      id: "wamid.1",
      type: "image",
      image: { id: "MID-1", mime_type: "image/jpeg", caption: "olha a nota" },
    });
    expect(extrairMensagemOficial(p)).toEqual({
      telefone: "5511999999999",
      texto: "olha a nota",
      wamId: "wamid.1",
      midia: { tipo: "image", id: "MID-1", mime: "image/jpeg", nome: null, caption: "olha a nota" },
    });
  });

  it("extrai documento com filename e sem caption", () => {
    const p = payloadMsg({
      from: "5511999999999",
      id: "wamid.2",
      type: "document",
      document: { id: "MID-2", mime_type: "application/pdf", filename: "nota.pdf" },
    });
    expect(extrairMensagemOficial(p)).toEqual({
      telefone: "5511999999999",
      texto: "[mídia]",
      wamId: "wamid.2",
      midia: { tipo: "document", id: "MID-2", mime: "application/pdf", nome: "nota.pdf", caption: "" },
    });
  });

  it("extrai áudio", () => {
    const p = payloadMsg({
      from: "5511999999999",
      id: "wamid.3",
      type: "audio",
      audio: { id: "MID-3", mime_type: "audio/ogg" },
    });
    expect(extrairMensagemOficial(p)?.midia).toEqual({
      tipo: "audio",
      id: "MID-3",
      mime: "audio/ogg",
      nome: null,
      caption: "",
    });
  });

  it("mídia sem id continua como marcador, sem mídia", () => {
    const p = payloadMsg({
      from: "5511999999999",
      id: "wamid.4",
      type: "image",
      image: { mime_type: "image/jpeg" },
    });
    expect(extrairMensagemOficial(p)).toEqual({
      telefone: "5511999999999",
      texto: "[mídia]",
      wamId: "wamid.4",
      midia: null,
    });
  });
});

describe("extrairStatusOficial", () => {
  it("mapeia sent/delivered/read", () => {
    expect(extrairStatusOficial(payloadStatus([{ id: "a", status: "sent" }]))).toEqual({
      status: "ENVIADO",
      ids: ["a"],
    });
    expect(extrairStatusOficial(payloadStatus([{ id: "b", status: "delivered" }]))?.status).toBe("ENTREGUE");
    expect(extrairStatusOficial(payloadStatus([{ id: "c", status: "read" }]))?.status).toBe("LIDO");
  });
  it("sem statuses → null", () => {
    expect(extrairStatusOficial(payloadMsg({ from: "x", id: "y", type: "text", text: { body: "z" } }))).toBeNull();
  });
});
