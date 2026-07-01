import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verificarHmac, mapearEvento } from "@/lib/assinatura/webhook";

const SEGREDO = "s3cr3t";
const hmac = (corpo: string) => createHmac("sha256", SEGREDO).update(corpo).digest("hex");

describe("verificarHmac", () => {
  it("aceita assinatura válida e rejeita inválida", () => {
    const corpo = '{"event":{"name":"sign"}}';
    expect(verificarHmac(corpo, hmac(corpo), SEGREDO)).toBe(true);
    expect(verificarHmac(corpo, "deadbeef", SEGREDO)).toBe(false);
    expect(verificarHmac(corpo, "", SEGREDO)).toBe(false);
  });
});

describe("mapearEvento", () => {
  // Formato legado real da Clicksign: nome do evento em event.name (sob HMAC),
  // signatário em event.data.signer.email, documento em document.key.
  it("mapeia sign/refusal/auto_close e ignora desconhecido", () => {
    expect(
      mapearEvento({ event: { name: "sign", data: { signer: { email: "a@x.com" } } }, document: { key: "doc1" } }),
    ).toEqual({ tipo: "assinou", documentKey: "doc1", email: "a@x.com" });
    expect(
      mapearEvento({ event: { name: "refusal", data: { signer: { email: "b@x.com" } } }, document: { key: "doc1" } }),
    ).toEqual({ tipo: "recusou", documentKey: "doc1", email: "b@x.com" });
    expect(mapearEvento({ event: { name: "auto_close" }, document: { key: "doc1" } })).toEqual({
      tipo: "finalizou",
      documentKey: "doc1",
    });
    expect(mapearEvento({ event: { name: "close" }, document: { key: "doc1" } })).toEqual({
      tipo: "finalizou",
      documentKey: "doc1",
    });
    expect(mapearEvento({ event: { name: "add_signer" }, document: { key: "doc1" } })).toEqual({ tipo: "ignorar" });
    expect(mapearEvento({})).toEqual({ tipo: "ignorar" });
  });

  it("normaliza o e-mail do signatário para lowercase", () => {
    expect(
      mapearEvento({ event: { name: "sign", data: { signer: { email: " Joao@Empresa.COM " } } }, document: { key: "d" } }),
    ).toEqual({ tipo: "assinou", documentKey: "d", email: "joao@empresa.com" });
  });
});
