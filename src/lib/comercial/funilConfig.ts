export function corValida(cor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(cor);
}

export function rotuloValido(rotulo: string): boolean {
  const t = rotulo.trim();
  return t.length > 0 && t.length <= 40;
}

export function proximaOrdem(etapas: { ordem: number }[]): number {
  return etapas.length === 0 ? 1 : Math.max(...etapas.map((e) => e.ordem)) + 1;
}

export function pctParaProb(pct: number): number {
  return Math.round((pct / 100) * 1000) / 1000;
}

export function probParaPct(prob: number): number {
  return Math.round(prob * 100);
}

// Troca o item com o vizinho na direção dada. Retorna nova lista (bordas inalteradas).
export function moverNaOrdem(ids: string[], id: string, dir: "cima" | "baixo"): string[] {
  const i = ids.indexOf(id);
  if (i < 0) return ids;
  const j = dir === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return ids;
  const copia = [...ids];
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}
