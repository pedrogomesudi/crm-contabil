// Enums TS espelhando os enums do banco (migration 0026).
export const CONTA_TIPOS = ["CORRENTE", "POUPANCA", "CAIXA", "CARTAO"] as const;
export type ContaTipo = (typeof CONTA_TIPOS)[number];

export const CATEGORIA_NATUREZAS = ["RECEITA", "DESPESA"] as const;
export type CategoriaNatureza = (typeof CATEGORIA_NATUREZAS)[number];

export const CATEGORIA_GRUPOS = ["OPERACIONAL", "NAO_OPERACIONAL"] as const;
export type CategoriaGrupo = (typeof CATEGORIA_GRUPOS)[number];

export const FAIXAS_FATURAMENTO = [
  "ATE_81K",
  "ATE_360K",
  "ATE_4_8MI",
  "ATE_78MI",
  "ACIMA_78MI",
] as const;
export type FaixaFaturamento = (typeof FAIXAS_FATURAMENTO)[number];

export const FAIXA_LABEL: Record<FaixaFaturamento, string> = {
  ATE_81K: "Até R$ 81 mil (MEI)",
  ATE_360K: "Até R$ 360 mil",
  ATE_4_8MI: "Até R$ 4,8 mi (Simples)",
  ATE_78MI: "Até R$ 78 mi (Presumido)",
  ACIMA_78MI: "Acima de R$ 78 mi",
};
