export type CelulaOrcamento = { categoriaId: string; mes: number; valor: number };
export type MapaValores = Record<string, Record<number, number>>;

const r2 = (n: number) => Math.round(n * 100) / 100;

// Achata o mapa da grade em células para upsert (só meses 1–12 com valor definido).
export function achatarValores(valores: MapaValores): CelulaOrcamento[] {
  const out: CelulaOrcamento[] = [];
  for (const [categoriaId, meses] of Object.entries(valores)) {
    for (let mes = 1; mes <= 12; mes++) {
      const v = meses?.[mes];
      if (v !== undefined && v !== null && !Number.isNaN(v)) out.push({ categoriaId, mes, valor: r2(v) });
    }
  }
  return out;
}

// Soma dos 12 meses de uma categoria (total da linha).
export function somaLinha(valores: MapaValores, categoriaId: string): number {
  let s = 0;
  const meses = valores[categoriaId] ?? {};
  for (let m = 1; m <= 12; m++) s += meses[m] ?? 0;
  return r2(s);
}

// Soma de uma coluna (mês) sobre um conjunto de categorias (total da coluna).
export function somaColuna(valores: MapaValores, categoriaIds: string[], mes: number): number {
  let s = 0;
  for (const id of categoriaIds) s += valores[id]?.[mes] ?? 0;
  return r2(s);
}
