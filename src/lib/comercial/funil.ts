export type EtapaOportunidade = "novo" | "contato" | "proposta" | "negociacao" | "ganho" | "perdido";

export const ETAPAS_ATIVAS: { chave: EtapaOportunidade; rotulo: string }[] = [
  { chave: "novo", rotulo: "Novo" },
  { chave: "contato", rotulo: "Contato feito" },
  { chave: "proposta", rotulo: "Proposta enviada" },
  { chave: "negociacao", rotulo: "Negociação" },
];

const ROTULOS: Record<EtapaOportunidade, string> = {
  novo: "Novo",
  contato: "Contato feito",
  proposta: "Proposta enviada",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function rotuloEtapa(e: EtapaOportunidade): string {
  return ROTULOS[e];
}

export function etapaAdjacente(e: EtapaOportunidade, dir: "anterior" | "proxima"): EtapaOportunidade | null {
  const i = ETAPAS_ATIVAS.findIndex((x) => x.chave === e);
  if (i < 0) return null;
  const j = dir === "anterior" ? i - 1 : i + 1;
  if (j < 0 || j >= ETAPAS_ATIVAS.length) return null;
  return ETAPAS_ATIVAS[j]!.chave;
}

export function resumoFunil(
  ops: { etapa: EtapaOportunidade; valorEstimado: number | null }[],
): Record<string, { qtd: number; total: number }> {
  const r: Record<string, { qtd: number; total: number }> = {};
  for (const { chave } of ETAPAS_ATIVAS) r[chave] = { qtd: 0, total: 0 };
  for (const o of ops) {
    if (!r[o.etapa]) continue;
    r[o.etapa]!.qtd += 1;
    r[o.etapa]!.total += o.valorEstimado ?? 0;
  }
  return r;
}
