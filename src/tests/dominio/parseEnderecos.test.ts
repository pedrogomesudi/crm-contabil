import { describe, it, expect } from "vitest";
import { parseEnderecos } from "@/lib/dominio/parseEnderecos";
import type { FolhaXls } from "@/lib/dominio/biff";

// Reproduz o layout "Dados Cadastrais" (rótulo col 0, valor col 4), 2 empresas.
function linha(col0: string, col4?: string) {
  const l: (string | null)[] = [col0, null, null, null, col4 ?? null];
  return l;
}
const folha: FolhaXls = {
  nome: "empresas",
  celulas: [
    linha("Empresa:", "RENATO"),
    linha("C.N.P.J.:", "50.565.165/0001-89"),
    linha("Código:", "44"),
    linha("Apelido:", "RENATO"),
    linha("Endereço:", "R OROZIMBO RIBEIRO"),
    linha("Número:", "1354"),
    linha("Bairro:", "SANTA MONICA"),
    linha("Município:", "UBERLANDIA"),
    linha("UF:", "MG"),
    linha("CEP:", "38408242"),
    linha("País:", "BRASIL"),
    linha("CNPJ/CPF/CEI/CAEPF:", "50.565.165/0001-89"),
    // segunda empresa
    linha("Código:", "45"),
    linha("Endereço:", "AV JOAO NAVES"),
    linha("Número:", "100"),
    linha("Município:", "UBERLANDIA"),
    linha("UF:", "MG"),
    linha("CEP:", "38400111"),
    linha("CNPJ/CPF/CEI/CAEPF:", "11.222.333/0001-81"),
  ] as FolhaXls["celulas"],
};

describe("parseEnderecos", () => {
  it("extrai CNPJ (só dígitos) e endereço por empresa", () => {
    const r = parseEnderecos(folha);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      cnpj: "50565165000189",
      endereco: {
        logradouro: "R OROZIMBO RIBEIRO",
        numero: "1354",
        bairro: "SANTA MONICA",
        cidade: "UBERLANDIA",
        uf: "MG",
        cep: "38408242",
        pais: "BRASIL",
      },
    });
    expect(r[1]?.cnpj).toBe("11222333000181");
    expect(r[1]?.endereco.logradouro).toBe("AV JOAO NAVES");
  });

  it("ignora blocos sem CNPJ válido", () => {
    const semCnpj: FolhaXls = {
      nome: "x",
      celulas: [linha("Código:", "1"), linha("Endereço:", "RUA X")] as FolhaXls["celulas"],
    };
    expect(parseEnderecos(semCnpj)).toHaveLength(0);
  });
});
