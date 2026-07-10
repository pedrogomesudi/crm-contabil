// Resolução de vigência: o valor vigente na competência C é o da linha com o maior
// vigente_de <= C. Antes da primeira vigência, extrapola a primeira e marca como estimado.
// Puro: as datas ISO são comparadas por string (ordenáveis lexicograficamente).

export type VigenciaValor = { vigenteDe: string; valor: number; estimada: boolean };

export function honorarioEm(
  vigencias: VigenciaValor[],
  mes: string, // "YYYY-MM"
): { valor: number; estimado: boolean } {
  if (vigencias.length === 0) return { valor: 0, estimado: true };
  const alvo = `${mes}-01`;
  const ordenadas = [...vigencias].sort((a, b) => a.vigenteDe.localeCompare(b.vigenteDe));

  let escolhida: VigenciaValor | undefined;
  for (const v of ordenadas) {
    if (v.vigenteDe <= alvo) escolhida = v;
    else break;
  }
  // Competência anterior a tudo: extrapola a primeira, e isso é uma estimativa.
  if (!escolhida) return { valor: ordenadas[0]!.valor, estimado: true };
  return { valor: escolhida.valor, estimado: escolhida.estimada };
}
