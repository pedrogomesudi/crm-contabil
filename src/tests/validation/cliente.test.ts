import { describe, it, expect } from "vitest";
import { clienteSchema } from "@/lib/validation/cliente";

const base = {
  tipo_pessoa: "PJ",
  razao_social: "Empresa X",
  cpf_cnpj: "11222333000181",
  regime_tributario: "Simples",
};

describe("clienteSchema", () => {
  it("aceita PJ + Simples + CNPJ válido", () => {
    expect(clienteSchema.safeParse(base).success).toBe(true);
  });
  it("rejeita PF com regime Simples (tipo×regime)", () => {
    const r = clienteSchema.safeParse({
      ...base,
      tipo_pessoa: "PF",
      regime_tributario: "Simples",
      cpf_cnpj: "52998224725",
    });
    expect(r.success).toBe(false);
  });
  it("rejeita CNPJ inválido", () => {
    const r = clienteSchema.safeParse({ ...base, cpf_cnpj: "11222333000100" });
    expect(r.success).toBe(false);
  });
  it("exige razao_social", () => {
    const r = clienteSchema.safeParse({ ...base, razao_social: "" });
    expect(r.success).toBe(false);
  });
  it("aceita PF + Isento/PF + CPF válido", () => {
    const r = clienteSchema.safeParse({
      tipo_pessoa: "PF",
      razao_social: "Fulano",
      cpf_cnpj: "52998224725",
      regime_tributario: "Isento/PF",
    });
    expect(r.success).toBe(true);
  });
});
