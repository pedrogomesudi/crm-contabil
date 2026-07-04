import { describe, it, expect } from "vitest";
import { normalizarTelefone, aplicarTemplate } from "@/lib/whatsapp/mensagem";

describe("normalizarTelefone", () => {
  it("adiciona DDI 55 a números BR de 10–11 dígitos", () => {
    expect(normalizarTelefone("(34) 99999-8888")).toBe("5534999998888");
    expect(normalizarTelefone("3433001774")).toBe("553433001774");
  });
  it("mantém quando já tem 55", () => {
    expect(normalizarTelefone("55 34 99999-8888")).toBe("5534999998888");
  });
  it("inválido => null", () => {
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
  });
});

describe("aplicarTemplate", () => {
  it("substitui variáveis; ausente vira vazio", () => {
    expect(aplicarTemplate("Olá {nome}, {valor}", { nome: "ACME", valor: "R$ 10" })).toBe("Olá ACME, R$ 10");
    expect(aplicarTemplate("Oi {x}", {})).toBe("Oi ");
  });
});
