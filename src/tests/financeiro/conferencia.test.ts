import { describe, it, expect } from "vitest";
import { avaliarConferencia, resumirConferencia, type LinhaConferencia } from "@/lib/financeiro/conferencia";

const base: LinhaConferencia = {
  clienteId: "c1",
  cliente: "Cliente X",
  honorario: 300,
  titulo: 300,
  temNota: true,
  notaValor: 300,
  notaCasa: true,
  boleto: 300,
};

describe("avaliarConferencia", () => {
  it("tudo batendo é pronto", () => {
    expect(avaliarConferencia(base)).toEqual({ nivel: "pronto", pendencias: [] });
  });
  it("sem honorário", () => {
    expect(avaliarConferencia({ ...base, honorario: null })).toEqual({
      nivel: "sem_honorario",
      pendencias: ["Sem honorário cadastrado"],
    });
  });
  it("sem boleto é falta (âmbar)", () => {
    const r = avaliarConferencia({ ...base, boleto: null });
    expect(r.nivel).toBe("falta");
    expect(r.pendencias).toEqual(["Sem boleto"]);
  });
  it("sem nota é falta", () => {
    const r = avaliarConferencia({ ...base, temNota: false, notaValor: null, notaCasa: false });
    expect(r.nivel).toBe("falta");
    expect(r.pendencias).toContain("Sem nota");
  });
  it("nota que não casa é bloqueado (JORDANA/outro serviço)", () => {
    const r = avaliarConferencia({ ...base, notaValor: 25500, notaCasa: false, boleto: null });
    expect(r.nivel).toBe("bloqueado");
    expect(r.pendencias).toContain("Nota não confere com o boleto");
  });
  it("título ≠ honorário é bloqueado", () => {
    const r = avaliarConferencia({ ...base, titulo: 350 });
    expect(r.nivel).toBe("bloqueado");
    expect(r.pendencias).toContain("Título ≠ honorário");
  });
  it("boleto ≠ título é bloqueado", () => {
    const r = avaliarConferencia({ ...base, boleto: 250 });
    expect(r.nivel).toBe("bloqueado");
    expect(r.pendencias).toContain("Boleto ≠ título");
  });
  it("compara em centavos (747,39 bate)", () => {
    expect(
      avaliarConferencia({ ...base, honorario: 747.39, titulo: 747.39, notaValor: 747.39, boleto: 747.39 }).nivel,
    ).toBe("pronto");
  });
});

describe("resumirConferencia", () => {
  it("conta cada nível e pendência", () => {
    const linhas = [
      { ...avaliarConferencia(base), linha: base },
      { ...avaliarConferencia({ ...base, boleto: null }), linha: { ...base, boleto: null } },
      {
        ...avaliarConferencia({ ...base, notaValor: 25500, notaCasa: false, boleto: null }),
        linha: { ...base, boleto: null },
      },
      { ...avaliarConferencia({ ...base, honorario: null }), linha: { ...base, honorario: null } },
    ];
    const r = resumirConferencia(linhas);
    expect(r.total).toBe(4);
    expect(r.pronto).toBe(1);
    expect(r.falta).toBe(1);
    expect(r.bloqueado).toBe(1);
    expect(r.semHonorario).toBe(1);
    expect(r.semBoleto).toBe(2);
    expect(r.notaDiverge).toBe(1);
  });
});
