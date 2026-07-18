import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Calculadora } from "@/app/(app)/comercial/precificacao/Calculadora";
import type { ConfigPreco } from "@/lib/comercial/precificacao";

const config: ConfigPreco = {
  baseRegime: { Simples: 500 },
  faturamento: { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [{ ate: null, valor: 100 }] },
  funcionarios: { modo: "unidade", valorUnitario: 25, franquia: 5, faixas: [] },
  notas: { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] },
  complexidades: [{ id: "c1", multiplicador: 1.2 }],
  servicos: [{ id: "s1", valor: 200, recorrencia: "mensal" }],
  valorMinimo: 400,
  descontoMaximoPct: 20,
};

describe("Calculadora", () => {
  it("renderiza o formulário e o resultado", () => {
    const html = renderToStaticMarkup(
      <Calculadora
        config={config}
        complexidades={[{ id: "c1", nome: "Média" }]}
        servicos={[{ id: "s1", nome: "Folha", valor: 200, recorrencia: "mensal" }]}
      />,
    );
    expect(html).toContain("Mensal"); // rótulo do resultado
    expect(html).toContain("Faturamento"); // campo
    expect(html).toContain("Folha"); // serviço marcável
  });
});
