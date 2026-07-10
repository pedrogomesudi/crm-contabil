import { describe, it, expect } from "vitest";
import { montarSimulacao, type ClienteReajuste } from "@/lib/reajuste/simulacao";

const clientes: ClienteReajuste[] = [
  { clienteId: "a", nome: "A", valorAtual: 500, indice: "SALARIO_MINIMO", percentualFixo: null },
  { clienteId: "b", nome: "B", valorAtual: 1000, indice: "PERCENTUAL_FIXO", percentualFixo: 10 },
];
const percentuais = { SALARIO_MINIMO: 6.7852 };

describe("montarSimulacao", () => {
  it("resolve o percentual pelo índice e calcula o valor novo", () => {
    const linhas = montarSimulacao(clientes, percentuais);
    expect(linhas[0]).toMatchObject({ clienteId: "a", percentual: 6.7852, valorNovo: 533.93, marcada: true });
  });
  it("PERCENTUAL_FIXO usa o percentual do cadastro, não o BACEN", () => {
    const linhas = montarSimulacao(clientes, percentuais);
    expect(linhas[1]).toMatchObject({ clienteId: "b", percentual: 10, valorNovo: 1100, marcada: true });
  });
  it("percentual 0 (índice indisponível) desmarca a linha", () => {
    const linhas = montarSimulacao(
      [{ clienteId: "c", nome: "C", valorAtual: 500, indice: "IPCA", percentualFixo: null }],
      {}, // IPCA ausente => 0
    );
    expect(linhas[0]).toMatchObject({ percentual: 0, valorNovo: 500, marcada: false });
  });
});
