export type LegTipo =
  | "abertura_simples"
  | "abertura_presumido"
  | "alteracao_quadro"
  | "transformacao"
  | "baixa"
  | "transferencia_entrada"
  | "transferencia_saida";
export type LegOrgao = "junta" | "receita" | "prefeitura" | "sefaz" | "bombeiros" | "vigilancia" | "outro";
export type LegProcStatus = "em_andamento" | "concluido" | "cancelado";
export type LegEtapaStatus = "pendente" | "em_andamento" | "concluido" | "isenta";

// Etapa "isenta" (não aplicável a esta empresa) conta como concluída para progresso/prazos.
export function etapaConcluida(status: LegEtapaStatus): boolean {
  return status === "concluido" || status === "isenta";
}

export const LEGALIZACAO_TIPOS: { valor: LegTipo; rotulo: string }[] = [
  { valor: "abertura_simples", rotulo: "Abertura — Simples Nacional" },
  { valor: "abertura_presumido", rotulo: "Abertura — Lucro Presumido" },
  { valor: "alteracao_quadro", rotulo: "Alteração de quadro societário" },
  { valor: "transformacao", rotulo: "Transformação de tipo societário" },
  { valor: "baixa", rotulo: "Baixa / encerramento" },
  { valor: "transferencia_entrada", rotulo: "Transferência — entrada" },
  { valor: "transferencia_saida", rotulo: "Transferência — saída" },
];

export const LEGALIZACAO_ORGAOS: { valor: LegOrgao; rotulo: string }[] = [
  { valor: "junta", rotulo: "Junta Comercial" },
  { valor: "receita", rotulo: "Receita Federal" },
  { valor: "prefeitura", rotulo: "Prefeitura" },
  { valor: "sefaz", rotulo: "Sefaz (Estado)" },
  { valor: "bombeiros", rotulo: "Corpo de Bombeiros" },
  { valor: "vigilancia", rotulo: "Vigilância Sanitária" },
  { valor: "outro", rotulo: "Outro" },
];

export function rotuloTipo(t: LegTipo): string {
  return LEGALIZACAO_TIPOS.find((x) => x.valor === t)?.rotulo ?? t;
}
export function rotuloOrgao(o: LegOrgao, outro?: string | null): string {
  if (o === "outro") return (outro && outro.trim()) || "Outro";
  return LEGALIZACAO_ORGAOS.find((x) => x.valor === o)?.rotulo ?? o;
}
