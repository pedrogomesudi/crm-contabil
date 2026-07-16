export type CategoriaDRE = {
  id: string;
  nome: string;
  natureza: "RECEITA" | "DESPESA";
  grupo: "OPERACIONAL" | "NAO_OPERACIONAL";
  ordem_dre: number;
};
export type LinhaDRE = { nome: string; valor: number };
export type GrupoDRE = { linhas: LinhaDRE[]; total: number };
export type DRE = {
  receitaOperacional: GrupoDRE;
  despesaOperacional: GrupoDRE;
  resultadoOperacional: number;
  receitaNaoOperacional: GrupoDRE;
  despesaNaoOperacional: GrupoDRE;
  resultadoLiquido: number;
};

function grupoDRE(
  categorias: CategoriaDRE[],
  valorPorCategoria: Record<string, number>,
  natureza: "RECEITA" | "DESPESA",
  grupo: "OPERACIONAL" | "NAO_OPERACIONAL",
): GrupoDRE {
  const linhas = categorias
    .filter((c) => c.natureza === natureza && c.grupo === grupo)
    .map((c) => ({ nome: c.nome, valor: valorPorCategoria[c.id] ?? 0, ordem: c.ordem_dre }))
    .filter((l) => l.valor !== 0)
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ nome, valor }) => ({ nome, valor }));
  return { linhas, total: linhas.reduce((s, l) => s + l.valor, 0) };
}

export function montarDRE(categorias: CategoriaDRE[], valorPorCategoria: Record<string, number>): DRE {
  const receitaOperacional = grupoDRE(categorias, valorPorCategoria, "RECEITA", "OPERACIONAL");
  const despesaOperacional = grupoDRE(categorias, valorPorCategoria, "DESPESA", "OPERACIONAL");
  const resultadoOperacional = receitaOperacional.total - despesaOperacional.total;
  const receitaNaoOperacional = grupoDRE(categorias, valorPorCategoria, "RECEITA", "NAO_OPERACIONAL");
  const despesaNaoOperacional = grupoDRE(categorias, valorPorCategoria, "DESPESA", "NAO_OPERACIONAL");
  const resultadoLiquido = resultadoOperacional + receitaNaoOperacional.total - despesaNaoOperacional.total;
  return {
    receitaOperacional,
    despesaOperacional,
    resultadoOperacional,
    receitaNaoOperacional,
    despesaNaoOperacional,
    resultadoLiquido,
  };
}
