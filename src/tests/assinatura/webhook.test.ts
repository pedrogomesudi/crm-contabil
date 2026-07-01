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
  // Formato legado real da Clicksign: signatário em event.data.signer.email,
  // documento em document.key; o nome do evento vem no header "event".
  const sign = { event: { data: { signer: { email: "a@x.com" } } }, document: { key: "doc1" } };
  it("mapeia sign/refusal/auto_close e ignora desconhecido", () => {
    expect(mapearEvento("sign", sign)).toEqual({ tipo: "assinou", documentKey: "doc1", email: "a@x.com" });
    expect(
      mapearEvento("refusal", { event: { data: { signer: { email: "b@x.com" } } }, document: { key: "doc1" } }),
    ).toEqual({ tipo: "recusou", documentKey: "doc1", email: "b@x.com" });
    expect(mapearEvento("auto_close", { document: { key: "doc1" } })).toEqual({
      tipo: "finalizou",
      documentKey: "doc1",
    });
    expect(mapearEvento("close", { document: { key: "doc1" } })).toEqual({ tipo: "finalizou", documentKey: "doc1" });
    expect(mapearEvento("add_signer", sign)).toEqual({ tipo: "ignorar" });
    expect(mapearEvento("sign", {})).toEqual({ tipo: "ignorar" });
  });
});
