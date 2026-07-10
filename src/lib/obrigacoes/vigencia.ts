// Regime vigente na competência. Devolve null quando não há vigência alguma — nesse caso
// o chamador usa o regime atual do cadastro.
export type VigenciaRegime = { vigenteDe: string; regime: string };

export function regimeEm(vigencias: VigenciaRegime[], competencia: string): string | null {
  if (vigencias.length === 0) return null;
  const alvo = `${competencia}-01`;
  const ordenadas = [...vigencias].sort((a, b) => a.vigenteDe.localeCompare(b.vigenteDe));

  let escolhida: VigenciaRegime | undefined;
  for (const v of ordenadas) {
    if (v.vigenteDe <= alvo) escolhida = v;
    else break;
  }
  return (escolhida ?? ordenadas[0]!).regime; // antes da primeira: extrapola
}
