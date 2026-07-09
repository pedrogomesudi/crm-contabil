export type RiscoBucket = "vencida" | "vencendo_hoje" | "no_prazo";
export function classificarRisco(vencimentoInterno: string, hoje: string): RiscoBucket {
  if (vencimentoInterno < hoje) return "vencida";
  if (vencimentoInterno === hoje) return "vencendo_hoje";
  return "no_prazo";
}

export type ItemRisco = { id: string; clienteNome: string; obrigacaoNome: string; competencia: string; periodicidade: string; vencimentoInterno: string; vencimentoLegal: string; responsavelId: string | null; responsavelNome: string | null };
export type GrupoRisco = { responsavelId: string | null; responsavelNome: string | null; itens: ItemRisco[] };
export type PainelRiscos = { resumo: { vencendoHoje: number; vencidas: number; semResponsavel: number }; grupos: GrupoRisco[] };

export function montarPainel(itens: ItemRisco[], hoje: string): PainelRiscos {
  let vencendoHoje = 0;
  let vencidas = 0;
  let semResponsavel = 0;
  const mapa = new Map<string, GrupoRisco>();
  for (const it of itens) {
    const r = classificarRisco(it.vencimentoInterno, hoje);
    if (r === "vencendo_hoje") vencendoHoje++;
    else if (r === "vencida") vencidas++;
    if (it.responsavelId === null) semResponsavel++;
    const chave = it.responsavelId ?? "__nulo__";
    const g = mapa.get(chave) ?? { responsavelId: it.responsavelId, responsavelNome: it.responsavelNome, itens: [] };
    g.itens.push(it);
    mapa.set(chave, g);
  }
  const grupos = [...mapa.values()];
  for (const g of grupos) g.itens.sort((a, b) => a.vencimentoInterno.localeCompare(b.vencimentoInterno));
  grupos.sort((a, b) => {
    if (a.responsavelId === null) return -1;
    if (b.responsavelId === null) return 1;
    return (a.responsavelNome ?? "").localeCompare(b.responsavelNome ?? "");
  });
  return { resumo: { vencendoHoje, vencidas, semResponsavel }, grupos };
}
