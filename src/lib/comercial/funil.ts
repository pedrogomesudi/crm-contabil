export type Etapa = { id: string; rotulo: string; ordem: number; cor: string; probabilidade: number };
export type ChaveEtapa = string; // etapa_id (ativa) OU "ganho"/"perdido" (terminal)

export const TERMINAIS = ["ganho", "perdido"] as const;
const ROTULO_TERMINAL: Record<string, string> = { ganho: "Ganho", perdido: "Perdido" };

export function rotuloEtapa(chave: ChaveEtapa, etapas: Etapa[]): string {
  if (chave in ROTULO_TERMINAL) return ROTULO_TERMINAL[chave]!;
  return etapas.find((e) => e.id === chave)?.rotulo ?? "—";
}

// Anda na ordem das etapas ATIVAS. Só faz sentido para etapa ativa.
export function etapaAdjacente(
  etapaId: string,
  etapas: Etapa[],
  dir: "anterior" | "proxima",
): string | null {
  const ord = [...etapas].sort((a, b) => a.ordem - b.ordem);
  const i = ord.findIndex((e) => e.id === etapaId);
  if (i < 0) return null;
  const j = dir === "anterior" ? i - 1 : i + 1;
  if (j < 0 || j >= ord.length) return null;
  return ord[j]!.id;
}

export function resumoFunil(
  ops: { etapa: ChaveEtapa; valorEstimado: number | null }[],
  etapas: Etapa[],
): Record<string, { qtd: number; total: number }> {
  const r: Record<string, { qtd: number; total: number }> = {};
  for (const e of etapas) r[e.id] = { qtd: 0, total: 0 };
  for (const o of ops) {
    if (!r[o.etapa]) continue; // terminais e etapas fora da lista: ignorados
    r[o.etapa]!.qtd += 1;
    r[o.etapa]!.total += o.valorEstimado ?? 0;
  }
  return r;
}

// Dias inteiros entre etapa_desde e agora. `agoraISO` é injetado (fica testável de forma pura).
export function diasNaEtapa(etapaDesde: string, agoraISO: string): number {
  const ms = new Date(agoraISO).getTime() - new Date(etapaDesde).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function corDias(dias: number): "recente" | "atencao" | "parado" {
  if (dias >= 10) return "parado";
  if (dias >= 5) return "atencao";
  return "recente";
}
