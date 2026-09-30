export function saldoTitulo(valor: number, somaBaixado: number): number {
  return Math.max(0, Number((valor - somaBaixado).toFixed(2)));
}

// O grupo de cobrança consolida SÓ as mensalidades. Um título de cliente em grupo só entra no
// boleto consolidado da titular quando é MENSALIDADE; avulsas (RECEITA_AVULSA, 13º, etc.) são
// sempre individuais e emitem boleto próprio, mesmo que o cliente componha um grupo.
export function consolidadoNoGrupo(t: { grupoCobrancaId: string | null; origem: string }): boolean {
  return Boolean(t.grupoCobrancaId) && t.origem === "MENSALIDADE";
}

// VENCIDO é derivado (não persistido): vencimento no passado e ainda há saldo em aberto.
export function ehVencido(vencimento: string, status: string, saldo: number): boolean {
  if (status === "BAIXADO" || status === "CANCELADO") return false;
  if (saldo <= 0) return false;
  return vencimento < new Date().toISOString().slice(0, 10);
}

// Rótulos da origem do título. Vivem aqui, e não no JSX, porque a planilha exportada
// precisa dizer exatamente o mesmo que a tabela — rótulo duplicado é rótulo que diverge.
export const LABEL_ORIGEM: Record<string, string> = {
  MENSALIDADE: "Mensalidade",
  RECEITA_AVULSA: "Avulsa",
  DECIMO_TERCEIRO: "13º",
};
export function rotuloOrigem(origem: string): string {
  return LABEL_ORIGEM[origem] ?? LABEL_ORIGEM.MENSALIDADE!;
}

// Os chips de status da tela de contas a receber, na ordem em que aparecem. O relatório
// exportado usa os mesmos rótulos para registrar qual recorte gerou o arquivo.
export const FILTROS_STATUS = [
  { chave: "TODOS", rotulo: "Todos" },
  { chave: "ABERTO", rotulo: "Em aberto" },
  { chave: "RECEBIDO", rotulo: "Recebido" },
  { chave: "VENCIDO", rotulo: "Vencido" },
  { chave: "CANCELADO", rotulo: "Cancelado" },
] as const;
export type FiltroStatus = (typeof FILTROS_STATUS)[number]["chave"];

export const LABEL_STATUS: Record<string, string> = {
  ABERTO: "Em aberto",
  VENCIDO: "Vencido",
  BAIXADO: "Recebido",
  BAIXADO_PARCIAL: "Recebido parcial",
  CANCELADO: "Cancelado",
};

// Seleção do filtro de grupo na tela de contas a receber: nenhum recorte, só quem está fora
// de grupo, ou um grupo específico (o próprio id).
export type SelecaoGrupo = "TODOS" | "SEM_GRUPO" | (string & {});

// Grupos que têm ao menos um título na competência carregada — é daqui que sai o seletor,
// para não oferecer grupo sem movimento no mês.
export function gruposPresentes(
  titulos: { grupoCobrancaId: string | null; grupoNome: string | null }[],
): { id: string; nome: string }[] {
  const mapa = new Map<string, string>();
  for (const t of titulos) {
    if (t.grupoCobrancaId) mapa.set(t.grupoCobrancaId, t.grupoNome ?? t.grupoCobrancaId);
  }
  return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// Filtro por PERTENCIMENTO ao grupo, não por boleto consolidado: a avulsa de um cliente em
// grupo (que emite boleto próprio — ver consolidadoNoGrupo) também aparece no recorte.
export function casaGrupoTitulo(t: { grupoCobrancaId: string | null }, selecao: SelecaoGrupo): boolean {
  if (selecao === "TODOS") return true;
  if (selecao === "SEM_GRUPO") return t.grupoCobrancaId === null;
  return t.grupoCobrancaId === selecao;
}
