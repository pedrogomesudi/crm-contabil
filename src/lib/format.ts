// Formata uma data ISO para dd/mm/aaaa no fuso de São Paulo (consistente
// independentemente do timezone do servidor). Retorna "—" para data inválida.
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Faz parse de valor monetário em formato BR.
// Aceita "1.500,50", "1500,50", "1500.50", "1500", "1.500" (milhar), "R$ 1.500,50".
// Retorna null para vazio e NaN para inválido.
export function parseValorBR(s: string): number | null {
  let t = s.replace(/[R$\s]/g, "").trim(); // remove "R$" e espaços
  if (t === "") return null;
  if (t.includes(",")) {
    // formato BR: ponto é separador de milhar, vírgula é decimal
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // só pontos em grupos de 3 (ex.: "1.500", "1.234.567") => milhar
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
