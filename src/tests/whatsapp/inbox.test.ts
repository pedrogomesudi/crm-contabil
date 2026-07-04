import { describe, it, expect } from "vitest";
import { extrairMensagemZapi, agruparConversas, type MsgConversa } from "@/lib/whatsapp/inbox";

describe("extrairMensagemZapi", () => {
  it("mensagem de texto recebida → objeto", () => {
    const r = extrairMensagemZapi({ phone: "5534999998888", fromMe: false, messageId: "M1", text: { message: "olá" } });
    expect(r).toEqual({ telefone: "5534999998888", texto: "olá", zId: "M1" });
  });
  it("aceita o campo message direto", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M2", message: "oi" })?.texto).toBe("oi");
  });
  it("mídia sem texto → marcador", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M3", image: { url: "x" } })?.texto).toBe("[mídia não suportada]");
  });
  it("fromMe (nossa saída) → null", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M4", fromMe: true, text: { message: "eco" } })).toBeNull();
  });
  it("evento sem mensagem (status) → null", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M5", status: "DELIVERED" })).toBeNull();
    expect(extrairMensagemZapi({ foo: "bar" })).toBeNull();
  });
});

describe("agruparConversas", () => {
  it("agrupa por telefone, conta não-lidas, ordena por recência", () => {
    const msgs: MsgConversa[] = [
      { telefone: "551", texto: "a1", direcao: "IN", lida: false, criado_em: "2026-07-01T10:00:00Z", cliente: "ACME" },
      { telefone: "551", texto: "a2", direcao: "OUT", lida: true, criado_em: "2026-07-01T11:00:00Z", cliente: "ACME" },
      { telefone: "552", texto: "b1", direcao: "IN", lida: false, criado_em: "2026-07-02T09:00:00Z", cliente: null },
    ];
    const convs = agruparConversas(msgs);
    expect(convs.map((c) => c.telefone)).toEqual(["552", "551"]); // 552 mais recente
    const c551 = convs.find((c) => c.telefone === "551")!;
    expect(c551).toMatchObject({ cliente: "ACME", ultima: "a2", nao_lidas: 1 });
  });
});
