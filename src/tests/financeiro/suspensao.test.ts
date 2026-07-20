import { describe, it, expect } from "vitest";
import { elegivelSuspensao, podeSuspender, podeReativar, motivoValido } from "@/lib/financeiro/suspensao";

describe("elegivelSuspensao", () => {
  it("elegível quando atraso >= tolerância e saldo >= piso", () => {
    expect(elegivelSuspensao(30, 500, 30, 100)).toBe(true);
  });
  it("não elegível se atraso menor que a tolerância", () => {
    expect(elegivelSuspensao(29, 500, 30, 100)).toBe(false);
  });
  it("não elegível se saldo abaixo do piso", () => {
    expect(elegivelSuspensao(40, 50, 30, 100)).toBe(false);
  });
  it("piso null = sem piso (qualquer saldo positivo conta)", () => {
    expect(elegivelSuspensao(40, 1, 30, null)).toBe(true);
  });
  it("tolerância null = feature desligada", () => {
    expect(elegivelSuspensao(999, 9999, null, null)).toBe(false);
  });
  it("tolerância 0 = desligada (não sugere ninguém)", () => {
    expect(elegivelSuspensao(999, 9999, 0, null)).toBe(false);
  });
  it("saldo zero nunca é elegível", () => {
    expect(elegivelSuspensao(40, 0, 30, null)).toBe(false);
  });
});

describe("alçada", () => {
  it("financeiro e admin suspendem; contador/assistente/cliente não", () => {
    expect(podeSuspender("admin")).toBe(true);
    expect(podeSuspender("financeiro")).toBe(true);
    expect(podeSuspender("contador")).toBe(false);
    expect(podeSuspender("assistente")).toBe(false);
    expect(podeSuspender("cliente")).toBe(false);
  });
  it("só admin reativa", () => {
    expect(podeReativar("admin")).toBe(true);
    expect(podeReativar("financeiro")).toBe(false);
    expect(podeReativar("contador")).toBe(false);
  });
});

describe("motivoValido", () => {
  it("exige texto não vazio após trim", () => {
    expect(motivoValido("acordo de parcelamento")).toBe(true);
    expect(motivoValido("   ")).toBe(false);
    expect(motivoValido("")).toBe(false);
  });
});
