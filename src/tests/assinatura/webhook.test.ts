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
  it("mapeia sign/refusal/close e ignora desconhecido", () => {
    expect(
      mapearEvento({ event: { name: "sign", data: { signer: { email: "a@x.com" } } }, envelope: { id: "env1" } }),
    ).toEqual({ tipo: "assinou", envelopeId: "env1", email: "a@x.com" });
    expect(
      mapearEvento({ event: { name: "refusal", data: { signer: { email: "b@x.com" } } }, envelope: { id: "env1" } }),
    ).toMatchObject({ tipo: "recusou", email: "b@x.com" });
    expect(mapearEvento({ event: { name: "close" }, envelope: { id: "env1" } })).toEqual({
      tipo: "finalizou",
      envelopeId: "env1",
    });
    expect(mapearEvento({ event: { name: "add_signer" } })).toEqual({ tipo: "ignorar" });
    expect(mapearEvento({})).toEqual({ tipo: "ignorar" });
  });
});
