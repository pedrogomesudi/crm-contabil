export type FaixaAging = "a_vencer" | "d1_30" | "d31_60" | "d61_90" | "d90_mais";

export function faixaAging(diasAtraso: number): FaixaAging {
  if (diasAtraso <= 0) return "a_vencer";
  if (diasAtraso <= 30) return "d1_30";
  if (diasAtraso <= 60) return "d31_60";
  if (diasAtraso <= 90) return "d61_90";
  return "d90_mais";
}

export const LABEL_FAIXA: Record<FaixaAging, string> = {
  a_vencer: "A vencer",
  d1_30: "1–30 dias",
  d31_60: "31–60 dias",
  d61_90: "61–90 dias",
  d90_mais: "90+ dias",
};

export function pctInadimplencia(vencido: number, carteira: number): number {
  if (carteira <= 0) return 0;
  return Number(((vencido / carteira) * 100).toFixed(2));
}
