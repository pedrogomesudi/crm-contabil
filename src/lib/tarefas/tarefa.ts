export type TarefaStatus = "aberta" | "em_andamento" | "concluida" | "cancelada";
export type TarefaPrioridade = "baixa" | "media" | "alta" | "urgente";

export const TAREFA_STATUS: { valor: TarefaStatus; rotulo: string }[] = [
  { valor: "aberta", rotulo: "Aberta" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "concluida", rotulo: "Concluída" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

export const TAREFA_PRIORIDADE: { valor: TarefaPrioridade; rotulo: string }[] = [
  { valor: "urgente", rotulo: "Urgente" },
  { valor: "alta", rotulo: "Alta" },
  { valor: "media", rotulo: "Média" },
  { valor: "baixa", rotulo: "Baixa" },
];

export function progressoChecklist(itens: { feito: boolean }[]): { total: number; feitos: number; pct: number } {
  const total = itens.length;
  const feitos = itens.filter((i) => i.feito).length;
  return { total, feitos, pct: total === 0 ? 0 : Math.round((feitos / total) * 100) };
}

const ORD: Record<TarefaPrioridade, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
export function ordemPrioridade(p: TarefaPrioridade): number {
  return ORD[p];
}
