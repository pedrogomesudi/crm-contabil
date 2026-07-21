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
  it("aceita porte válido e o mantém", () => {
    const r = clienteSchema.safeParse({ ...base, porte: "ME" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.porte).toBe("ME");
  });
  it("trata porte vazio como ausente (não erro)", () => {
    const r = clienteSchema.safeParse({ ...base, porte: "" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.porte).toBeUndefined();
  });
  it("rejeita porte inválido", () => {
    expect(clienteSchema.safeParse({ ...base, porte: "GRANDE" }).success).toBe(false);
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

  // Matriz completa tipo×regime: só 4 combinações são válidas (espelha o CHECK do banco).
  const VALIDAS = new Set(["PJ|Simples", "PJ|Presumido", "PJ|Real", "PF|Isento/PF", "MEI|MEI"]);
  const TIPOS = ["PJ", "PF", "MEI"] as const;
  const REGS = ["Simples", "Presumido", "Real", "MEI", "Isento/PF"] as const;
  const docPara = (t: string) => (t === "PF" ? "52998224725" : "11222333000181");
  for (const t of TIPOS) {
    for (const reg of REGS) {
      const esperado = VALIDAS.has(`${t}|${reg}`);
      it(`tipo×regime: ${t}+${reg} => ${esperado ? "válido" : "inválido"}`, () => {
        const r = clienteSchema.safeParse({
          tipo_pessoa: t,
          razao_social: "Teste",
          cpf_cnpj: docPara(t),
          regime_tributario: reg,
        });
        expect(r.success).toBe(esperado);
      });
    }
  }

  it("rejeita data_inicio com data de calendário inexistente", () => {
    const r = clienteSchema.safeParse({ ...base, data_inicio: "2026-13-45" });
    expect(r.success).toBe(false);
  });
  it("aceita data_inicio válida", () => {
    const r = clienteSchema.safeParse({ ...base, data_inicio: "2026-02-28" });
    expect(r.success).toBe(true);
  });
  it("aceita data_inicio vazia (opcional)", () => {
    const r = clienteSchema.safeParse({ ...base, data_inicio: "" });
    expect(r.success).toBe(true);
  });
});
