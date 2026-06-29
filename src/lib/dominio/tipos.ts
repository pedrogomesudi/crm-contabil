export type EnderecoDominio = {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  pais?: string;
};
export type EmpresaDominio = {
  codigo: number;
  razaoSocial: string;
  cnpj: string;
  status: string;
  cnae: string | null;
  regimeDominio: string;
  inscricaoEstadual: string | null;
};
export type ContatoDominio = {
  codigo: number;
  nome: string;
  apelido: string | null;
  cnpj: string | null;
  endereco: EnderecoDominio | null;
  email: string | null;
  telefone: string | null;
};
export type ContratoDominio = {
  codigoCliente: number;
  clienteNome: string;
  tipoContrato: string;
  emissao: string | null;
  inicioContrato: string | null;
  inicioFaturamento: string | null;
  diaVencimento: string | null;
  encerradoEm: string | null;
  valorOriginal: number | null;
  valorAtual: number | null;
};
export type TipoArquivoDominio = "empresas" | "clientes" | "contratos" | "desconhecido";

// Serial do Excel (base 1899-12-30) -> "YYYY-MM-DD". Ignora a fração de hora.
export function serialParaISO(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Math.floor(n) * 86400000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

// Lê um valor como número, aceitando number ou string numérica (ex.: código de
// linha que o export pode formatar como texto). Retorna null se não for número.
export function comoNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
