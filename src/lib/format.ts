// Faz parse de valor monetário em formato BR. Aceita "1.500,50", "1500,50",
// "1500.50", "1500". Retorna null para vazio e NaN para inválido.
export function parseValorBR(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  // com vírgula => formato BR (ponto é milhar); sem vírgula => número simples
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}
