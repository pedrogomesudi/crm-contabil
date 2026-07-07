export type DadosPagamento = {
  pixChave?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  titular?: string | null;
  documento?: string | null;
};

// Monta as linhas de pagamento a partir dos dados preenchidos (omite as vazias).
export function linhasPagamento(d: DadosPagamento): string {
  const linhas: string[] = [];
  if (d.pixChave) linhas.push(`PIX: ${d.pixChave}`);
  const partes = [d.banco && `Banco ${d.banco}`, d.agencia && `Ag. ${d.agencia}`, d.conta && `Conta ${d.conta}`].filter(Boolean);
  if (partes.length) {
    let ted = `TED: ${partes.join(", ")}`;
    if (d.titular) ted += ` — ${d.titular}`;
    if (d.documento) ted += ` (${d.documento})`;
    linhas.push(ted);
  }
  return linhas.join("\n");
}

// "2026-07-01" → "07/2026".
export function competenciaBR(dataIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dataIso);
  return m ? `${m[2]}/${m[1]}` : dataIso;
}

// nfseIds das notas ainda não enviadas (para pré-marcar na seleção).
export function preSelecionadas(notas: { nfseId: string; jaEnviada: boolean }[]): Set<string> {
  return new Set(notas.filter((n) => !n.jaEnviada).map((n) => n.nfseId));
}

export type VarsNota = {
  nome: string;
  empresa: string;
  competencia: string;
  valor: string;
  vencimento: string;
  pix: string;
  favorecido: string;
  cnpj: string;
  banco: string;
  agencia: string;
  conta: string;
  pagamento: string;
};

const ALIAS_NOTA: Record<string, keyof VarsNota> = {
  NOME: "nome",
  CONTATO: "nome",
  EMPRESA: "empresa",
  CLIENTE: "empresa",
  COMPETENCIA: "competencia",
  MES: "competencia",
  MESANO: "competencia",
  VALOR: "valor",
  DATA: "vencimento",
  VENCIMENTO: "vencimento",
  PIX: "pix",
  CHAVEPIX: "pix",
  RAZAOSOCIAL: "favorecido",
  FAVORECIDO: "favorecido",
  TITULAR: "favorecido",
  CNPJ: "cnpj",
  DOCUMENTO: "cnpj",
  BANCO: "banco",
  AG: "agencia",
  AGENCIA: "agencia",
  CONTA: "conta",
  CC: "conta",
  PAGAMENTO: "pagamento",
};

function normalizarChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Substitui marcadores {...} do template da nota. Ignora maiúscula/acento/espaço/pontuação; desconhecido → "".
export function montarMensagemNota(template: string, vars: VarsNota): string {
  return template.replace(/\{([^}]+)\}/g, (_orig, nome: string) => {
    const campo = ALIAS_NOTA[normalizarChave(nome)];
    return campo ? vars[campo] : "";
  });
}
