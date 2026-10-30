import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("contas a receber em cartões", () => {
  const src = readFileSync("src/components/financeiro/ContasReceber.tsx", "utf8");

  it("usa o TabelaCartao", () => {
    expect(src).toContain("TabelaCartao");
  });

  it("toda coluna de dado declara seu rótulo", () => {
    for (const rotulo of ["Cliente", "Origem", "Vencimento", "Valor", "Saldo", "Status"]) {
      expect(src, `faltou data-rotulo="${rotulo}"`).toContain(`data-rotulo="${rotulo}"`);
    }
  });

  it("a célula de estado vazio e as de ação não recebem rótulo", () => {
    // Rótulo em célula de colSpan apareceria por cima da mensagem "nenhum resultado"; em célula
    // de ação, etiquetaria um botão como se fosse dado.
    const celulasColSpan = src.match(/<td[^>]*colSpan[^>]*>/g) ?? [];
    for (const c of celulasColSpan) expect(c, `colSpan com rótulo: ${c}`).not.toContain("data-rotulo");
  });
});
