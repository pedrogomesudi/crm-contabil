import { describe, it, expect } from "vitest";
import { detectarTipo } from "@/lib/dominio/detectar";
import type { FolhaXls } from "@/lib/dominio/biff";

const folha = (celulas: (string | number | null)[][]): FolhaXls => ({ nome: "F", celulas });

describe("detectarTipo", () => {
  it("detecta empresas pelos títulos da tabela", () => {
    const f = folha([
      [null],
      [null],
      ["Relação de R..."],
      [null],
      ["Cód.", "Empresa", "CNPJ", "Status", "CNAE Principal", "Regime Tributário "],
    ]);
    expect(detectarTipo(f)).toBe("empresas");
  });
  it("detecta contratos", () => {
    const f = folha([
      ["RELAÇÃO DE CONTRATOS"],
      [null],
      [null],
      [null],
      ["Código", "Cliente", null, null, null, null, null, "Tipo de contrato"],
    ]);
    expect(detectarTipo(f)).toBe("contratos");
  });
  it("detecta clientes (ficha) pelo rótulo Apelido:/Empresa:", () => {
    const f = folha([["CLIENTES"], ["Código:", 1], ["Apelido:", "X"], ["Empresa:", "32 - X"]]);
    expect(detectarTipo(f)).toBe("clientes");
  });
  it("retorna desconhecido para conteúdo estranho", () => {
    expect(detectarTipo(folha([["foo", "bar"]]))).toBe("desconhecido");
  });
});
