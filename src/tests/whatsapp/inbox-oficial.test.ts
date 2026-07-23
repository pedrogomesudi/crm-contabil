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
  it("mídia vira marcador na 2A (midia null)", () => {
    const m = extrairMensagemOficial(
      payloadMsg({ from: "5511", id: "wamid.Y", type: "image", image: { id: "MID", mime_type: "image/png" } }),
    );
    expect(m?.midia).toBeNull();
    expect(m?.texto).toBe("[mídia]");
  });
  it("sem mensagem → null", () => {
    expect(extrairMensagemOficial(payloadStatus([{ id: "x", status: "sent" }]))).toBeNull();
    expect(extrairMensagemOficial({})).toBeNull();
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
