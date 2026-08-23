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

// Dias de atraso de um vencimento em relação a "hoje" (ambos "YYYY-MM-DD"). Positivo = vencido;
// 0 ou negativo = ainda a vencer.
export function diasAtraso(vencimentoIso: string, hojeIso: string): number {
  const v = Date.parse(`${vencimentoIso}T00:00:00Z`);
  const h = Date.parse(`${hojeIso}T00:00:00Z`);
  if (Number.isNaN(v) || Number.isNaN(h)) return 0;
  return Math.round((h - v) / 86_400_000);
}

// Situação textual de um título em aberto: "A vencer" ou "Vencido há N dia(s)".
export function situacaoAtraso(vencimentoIso: string, hojeIso: string): string {
  const d = diasAtraso(vencimentoIso, hojeIso);
  if (d <= 0) return "A vencer";
  return `Vencido há ${d} dia${d === 1 ? "" : "s"}`;
}
