import { describe, it, expect } from "vitest";
import { linhasPagamento, competenciaBR, preSelecionadas } from "@/lib/whatsapp/notas-envio";

describe("linhasPagamento", () => {
  it("PIX + TED completo", () => {
    expect(
      linhasPagamento({ pixChave: "12.345.678/0001-90", banco: "Inter", agencia: "0001", conta: "12345-6", titular: "Gomes", documento: "12.345.678/0001-90" }),
    ).toBe("PIX: 12.345.678/0001-90\nTED: Banco Inter, Ag. 0001, Conta 12345-6 — Gomes (12.345.678/0001-90)");
  });
  it("só PIX", () => {
    expect(linhasPagamento({ pixChave: "chave@pix.com" })).toBe("PIX: chave@pix.com");
  });
  it("só TED", () => {
    expect(linhasPagamento({ banco: "Inter", agencia: "1", conta: "9" })).toBe("TED: Banco Inter, Ag. 1, Conta 9");
  });
  it("vazio → string vazia", () => {
    expect(linhasPagamento({})).toBe("");
  });
});

describe("competenciaBR", () => {
  it("YYYY-MM-DD → MM/YYYY", () => {
    expect(competenciaBR("2026-07-01")).toBe("07/2026");
  });
  it("valor inesperado → devolve como veio", () => {
    expect(competenciaBR("abc")).toBe("abc");
  });
});

describe("preSelecionadas", () => {
  it("marca só as pendentes (jaEnviada false)", () => {
    const s = preSelecionadas([
      { nfseId: "a", jaEnviada: false },
      { nfseId: "b", jaEnviada: true },
      { nfseId: "c", jaEnviada: false },
    ]);
    expect([...s].sort()).toEqual(["a", "c"]);
  });
  it("todas enviadas → vazio", () => {
    expect(preSelecionadas([{ nfseId: "a", jaEnviada: true }]).size).toBe(0);
  });
  it("nenhuma enviada → todas", () => {
    expect(preSelecionadas([{ nfseId: "a", jaEnviada: false }, { nfseId: "b", jaEnviada: false }]).size).toBe(2);
  });
});
