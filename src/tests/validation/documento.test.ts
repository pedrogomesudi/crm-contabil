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
  it("rejeita todos os dígitos iguais", () => expect(validarCNPJ("11111111111111")).toBe(false));
  it("rejeita comprimento errado (13)", () => expect(validarCNPJ("1122233300018")).toBe(false));
  it("rejeita vazio", () => expect(validarCNPJ("")).toBe(false));
  it("aceita CNPJ com pontuação", () => expect(validarCNPJ("11.222.333/0001-81")).toBe(true));
});

describe("validarDocumento", () => {
  it("PF valida como CPF", () => expect(validarDocumento("PF", "52998224725")).toBe(true));
  it("MEI valida como CNPJ", () => expect(validarDocumento("MEI", "11222333000181")).toBe(true));
  it("PJ valida como CNPJ", () => expect(validarDocumento("PJ", "11222333000181")).toBe(true));
});
