import { describe, it, expect } from "vitest";
import { enderecoTomadorDoForm } from "@/lib/nfse/tomador";

describe("enderecoTomadorDoForm", () => {
  const campos: Record<string, string> = {
    tom_cep: "04576-010",
    tom_logradouro: "Av Jorn Roberto Marinho",
    tom_numero: "85",
    tom_bairro: "Cidade Monções",
    tom_cidade: "São Paulo",
    tom_uf: "sp",
    tom_cmun: "3550308",
  };
  const e = enderecoTomadorDoForm((k) => campos[k] ?? "");

  it("grava o IBGE do tomador em codigo_municipio (a chave que o dps.ts lê), não em cMun", () => {
    // Regressão do E0240: com a chave `cMun` o código do tomador era descartado
    // e o XML usava o município do prestador.
    expect(e.codigo_municipio).toBe("3550308");
    expect(e).not.toHaveProperty("cMun");
  });

  it("normaliza o CEP para 8 dígitos preservando o zero à esquerda", () => {
    expect(e.cep).toBe("04576010");
  });

  it("normaliza a UF para 2 letras maiúsculas", () => {
    expect(e.uf).toBe("SP");
  });
});
