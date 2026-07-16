import type { MapaValores } from "@/lib/financeiro/orcamento";

export type TipoPeriodo = "mes" | "trimestre" | "semestre" | "ano";
export type MesRef = { ano: number; mes: number };
export type Natureza = "RECEITA" | "DESPESA";
export type CategoriaRef = { id: string; nome: string; natureza: Natureza; ordem_dre: number };
export type LancRealizado = { categoriaId: string; ano: number; mes: number; valor: number };

export type LinhaComparativo = {
  categoriaId: string;
  nome: string;
  natureza: Natureza;
  orcado: number;
  realizado: number;
  varAbs: number;
  varPct: number | null;
};
export type GrupoComparativo = {
  natureza: Natureza;
  linhas: LinhaComparativo[];
  totalOrcado: number;
  totalRealizado: number;
  varAbs: number;
  varPct: number | null;
};
export type PontoSerie = { mes: number; orcado: number; realizado: number };
export type Comparativo = {
  grupos: GrupoComparativo[];
  resultado: { orcado: number; realizado: number; varAbs: number; varPct: number | null };
  serieReceita: PontoSerie[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function mesesDoPeriodo(tipo: TipoPeriodo, ano: number, indice: number): MesRef[] {
  let meses: number[];
  if (tipo === "mes") meses = [indice];
  else if (tipo === "trimestre") {
    const s = (indice - 1) * 3 + 1;
    meses = [s, s + 1, s + 2];
  } else if (tipo === "semestre") {
    const s = (indice - 1) * 6 + 1;
    meses = Array.from({ length: 6 }, (_, i) => s + i);
  } else {
    meses = Array.from({ length: 12 }, (_, i) => i + 1);
  }
  return meses.map((mes) => ({ ano, mes }));
}

export function variacao(orcado: number, realizado: number): { abs: number; pct: number | null } {
  const abs = r2(realizado - orcado);
  const pct = orcado === 0 ? null : r2(((realizado - orcado) / orcado) * 100);
  return { abs, pct };
}

export function montarComparativo(
  categorias: CategoriaRef[],
  orcamento: MapaValores,
  realizado: LancRealizado[],
  meses: MesRef[],
  ano: number,
): Comparativo {
  const mesesSet = new Set(meses.filter((m) => m.ano === ano).map((m) => m.mes));
  const realPorCatMes: Record<string, Record<number, number>> = {};
  for (const l of realizado) {
    if (l.ano !== ano) continue;
    const cat = (realPorCatMes[l.categoriaId] ??= {});
    cat[l.mes] = (cat[l.mes] ?? 0) + l.valor;
  }

  const linhaPara = (cat: CategoriaRef): LinhaComparativo => {
    let orcado = 0;
    let real = 0;
    for (const mes of mesesSet) {
      orcado += orcamento[cat.id]?.[mes] ?? 0;
      real += realPorCatMes[cat.id]?.[mes] ?? 0;
    }
    orcado = r2(orcado);
    real = r2(real);
    const v = variacao(orcado, real);
    return {
      categoriaId: cat.id,
      nome: cat.nome,
      natureza: cat.natureza,
      orcado,
      realizado: real,
      varAbs: v.abs,
      varPct: v.pct,
    };
  };

  const grupoPara = (natureza: Natureza): GrupoComparativo => {
    const linhas = categorias
      .filter((c) => c.natureza === natureza)
      .sort((a, b) => a.ordem_dre - b.ordem_dre)
      .map(linhaPara);
    const totalOrcado = r2(linhas.reduce((s, l) => s + l.orcado, 0));
    const totalRealizado = r2(linhas.reduce((s, l) => s + l.realizado, 0));
    const v = variacao(totalOrcado, totalRealizado);
    return { natureza, linhas, totalOrcado, totalRealizado, varAbs: v.abs, varPct: v.pct };
  };

  const gRec = grupoPara("RECEITA");
  const gDes = grupoPara("DESPESA");
  const resOrc = r2(gRec.totalOrcado - gDes.totalOrcado);
  const resReal = r2(gRec.totalRealizado - gDes.totalRealizado);
  const vRes = variacao(resOrc, resReal);

  const receitaCats = categorias.filter((c) => c.natureza === "RECEITA").map((c) => c.id);
  const serieReceita: PontoSerie[] = Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
    let orc = 0;
    let rl = 0;
    for (const id of receitaCats) {
      orc += orcamento[id]?.[mes] ?? 0;
      rl += realPorCatMes[id]?.[mes] ?? 0;
    }
    return { mes, orcado: r2(orc), realizado: r2(rl) };
  });

  return {
    grupos: [gRec, gDes],
    resultado: { orcado: resOrc, realizado: resReal, varAbs: vRes.abs, varPct: vRes.pct },
    serieReceita,
  };
}
