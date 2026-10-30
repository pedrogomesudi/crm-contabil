import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A lista de Clientes é a tela mais consultada fora da mesa. No cartão, cada valor precisa
// dizer de que coluna é — senão "Simples" e "Enviado" aparecem soltos, sem contexto.
describe("lista de clientes em cartões", () => {
  const src = readFileSync("src/app/(app)/clientes/page.tsx", "utf8");

  it("usa o TabelaCartao", () => {
    expect(src).toContain("TabelaCartao");
  });

  it("toda coluna de dado declara seu rótulo", () => {
    for (const rotulo of ["Cliente", "Regime", "Contrato", "Situação"]) {
      expect(src, `faltou data-rotulo="${rotulo}"`).toContain(`data-rotulo="${rotulo}"`);
    }
  });
});
