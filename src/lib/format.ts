// Mantém só os dígitos de um valor (normalização de CPF/CNPJ, telefone, etc.).
export function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

// Formata uma data ISO para dd/mm/aaaa no fuso de São Paulo (consistente
// independentemente do timezone do servidor). Retorna "—" para data inválida.
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Data pura (YYYY-MM-DD): formata os componentes direto, SEM conversão de fuso —
  // `new Date("2026-07-10")` seria UTC 00:00 e cairia no dia anterior em America/Sao_Paulo (UTC-3).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Timestamp: converte para o fuso de São Paulo.
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

// Formata CPF (11) ou CNPJ (14); tamanho inesperado devolve só os dígitos.
export function formatarDocumento(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

// CEP no padrão NN.NNN-NNN (ex.: 38411342 -> 38.411-342), como na minuta.
export function formatarCep(cep: string): string {
  const d = soDigitos(cep);
  return d.length === 8 ? d.replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2-$3") : d;
}

export function formatarMoeda(valor: number): string {
  return "R$ " + valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Telefone: celular (11 díg) -> (NN) N NNNN-NNNN; fixo (10 díg) -> (NN) NNNN-NNNN.
export function formatarTelefone(tel: string): string {
  const d = soDigitos(tel);
  if (d.length === 11) return d.replace(/(\d{2})(\d)(\d{4})(\d{4})/, "($1) $2 $3-$4");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return d;
}
