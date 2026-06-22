import { describe, it, expect } from "vitest";
import { validarCPF, validarCNPJ, validarDocumento } from "@/lib/validation/documento";

describe("validarCPF", () => {
  it("aceita CPF válido", () => expect(validarCPF("52998224725")).toBe(true));
  it("rejeita CPF inválido", () => expect(validarCPF("11111111111")).toBe(false));
  it("rejeita comprimento errado", () => expect(validarCPF("123")).toBe(false));
});

describe("validarCNPJ", () => {
  it("aceita CNPJ válido", () => expect(validarCNPJ("11222333000181")).toBe(true));
  it("rejeita CNPJ inválido", () => expect(validarCNPJ("11222333000100")).toBe(false));
});

describe("validarDocumento", () => {
  it("PF valida como CPF", () => expect(validarDocumento("PF", "52998224725")).toBe(true));
  it("MEI valida como CNPJ", () => expect(validarDocumento("MEI", "11222333000181")).toBe(true));
  it("PJ valida como CNPJ", () => expect(validarDocumento("PJ", "11222333000181")).toBe(true));
});
