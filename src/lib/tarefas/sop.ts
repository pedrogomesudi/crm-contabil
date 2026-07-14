export type SopEtapa = {
  id: string;
  onda: number;
  ordem: number;
  titulo: string;
  descricao: string | null;
  responsavelPapel: string | null;
  prazoDias: number;
  prioridade: string;
  itens: string[];
};

export type Onda = { onda: number; etapas: SopEtapa[] };

// Agrupa as etapas por onda (mesma onda = paralelas; ondas = sequência).
export function ondasDoTemplate(etapas: SopEtapa[]): Onda[] {
  const mapa = new Map<number, SopEtapa[]>();
  for (const e of etapas) {
    const lista = mapa.get(e.onda) ?? [];
    lista.push(e);
    mapa.set(e.onda, lista);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([onda, lista]) => ({ onda, etapas: lista.sort((a, b) => a.ordem - b.ordem) }));
}

// Resumo do fluxo, para a prévia: "Onda 1 (2 em paralelo) → Onda 2 (1)".
export function resumoFluxo(etapas: SopEtapa[]): string {
  const ondas = ondasDoTemplate(etapas);
  if (ondas.length === 0) return "Sem etapas.";
  return ondas
    .map((o) => `Onda ${o.onda} (${o.etapas.length}${o.etapas.length > 1 ? " em paralelo" : ""})`)
    .join(" → ");
}

export function progressoProcesso(tarefas: { status: string }[]): { feitas: number; total: number; pct: number } {
  const total = tarefas.length;
  const feitas = tarefas.filter((t) => t.status === "concluida" || t.status === "cancelada").length;
  return { feitas, total, pct: total === 0 ? 0 : Math.round((feitas / total) * 100) };
}
