import { describe, it, expect } from "vitest";
import { avisoContratosNaoVinculados, avisoContratosNaoCasados } from "@/lib/dominio/avisos";

describe("avisoContratosNaoVinculados", () => {
  it("alerta quando há contratos mas NENHUM vinculou", () => {
    const aviso = avisoContratosNaoVinculados(78, 0);
    expect(aviso).toBeTruthy();
    expect(aviso).toMatch(/Regime/); // aponta o relatório culpado (nome+CNPJ)
    expect(aviso).toMatch(/honor/i); // avisa do risco ao honorário
  });

  it("não alerta em vínculo parcial", () => {
    expect(avisoContratosNaoVinculados(78, 40)).toBeNull();
  });

  it("não alerta quando não há arquivo de contratos", () => {
    expect(avisoContratosNaoVinculados(0, 0)).toBeNull();
  });

  it("não alerta quando todos vincularam", () => {
    expect(avisoContratosNaoVinculados(50, 50)).toBeNull();
  });
});

describe("avisoContratosNaoCasados", () => {
  it("lista os nomes que não casaram", () => {
    const aviso = avisoContratosNaoCasados(["JOAO VITOR", "MHM CONSULTORIA"], []);
    expect(aviso).toBeTruthy();
    expect(aviso).toMatch(/JOAO VITOR/);
    expect(aviso).toMatch(/MHM CONSULTORIA/);
    expect(aviso).toMatch(/honor/i);
  });

  it("sinaliza nomes ambíguos separadamente", () => {
    const aviso = avisoContratosNaoCasados([], ["SILVA CONSULTORIA"]);
    expect(aviso).toMatch(/amb/i);
    expect(aviso).toMatch(/SILVA CONSULTORIA/);
  });

  it("retorna null quando está tudo casado", () => {
    expect(avisoContratosNaoCasados([], [])).toBeNull();
  });
});
