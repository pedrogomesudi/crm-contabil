export type LinhaReceita = { origem: string | null; valorGanho: number; propostaMensal: number; propostaUnico: number };
export type FonteReceita = {
  origem: string;
  ganhos: number;
  valorGanho: number;
  propostaMensal: number;
  propostaUnico: number;
};

const SEM_ORIGEM = "Sem origem";

export function receitaPorOrigem(linhas: LinhaReceita[]): FonteReceita[] {
  const mapa = new Map<string, FonteReceita>();
  for (const l of linhas) {
    const chave = (l.origem ?? "").trim() || SEM_ORIGEM;
    const f = mapa.get(chave) ?? { origem: chave, ganhos: 0, valorGanho: 0, propostaMensal: 0, propostaUnico: 0 };
    f.ganhos += 1;
    f.valorGanho += l.valorGanho;
    f.propostaMensal += l.propostaMensal;
    f.propostaUnico += l.propostaUnico;
    mapa.set(chave, f);
  }
  return [...mapa.values()].sort((a, b) => b.valorGanho - a.valorGanho || a.origem.localeCompare(b.origem));
}

export function totalReceita(fontes: FonteReceita[]): Omit<FonteReceita, "origem"> {
  return fontes.reduce(
    (t, f) => ({
      ganhos: t.ganhos + f.ganhos,
      valorGanho: t.valorGanho + f.valorGanho,
      propostaMensal: t.propostaMensal + f.propostaMensal,
      propostaUnico: t.propostaUnico + f.propostaUnico,
    }),
    { ganhos: 0, valorGanho: 0, propostaMensal: 0, propostaUnico: 0 },
  );
}
