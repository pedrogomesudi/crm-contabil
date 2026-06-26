// Mantém só os dígitos de um valor (normalização de CPF/CNPJ, telefone, etc.).
export function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

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
  // Aceita SÓ número decimal simples. Barra notação científica ("1e3"),
  // hexadecimal ("0x10"), sinal "+" e qualquer lixo que o Number() toleraria.
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return n === 0 ? 0 : n; // normaliza -0
}
