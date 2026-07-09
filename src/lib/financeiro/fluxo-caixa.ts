const r2 = (n: number) => Math.round(n * 100) / 100;

export type NaturezaFC = "RECEITA" | "DESPESA";
export type CategoriaFC = { id: string; nome: string; natureza: NaturezaFC; ordem_dre: number };
export type ItemFluxo = { categoriaId: string; mes: number; tipo: "RECEBER" | "PAGAR"; valor: number };
export type LinhaFluxo = { categoriaId: string; nome: string; valores: number[]; total: number };
export type GrupoFluxo = { titulo: "Entradas" | "Saídas"; linhas: LinhaFluxo[]; totais: number[]; total: number };
export type FluxoCaixa = {
  entradas: GrupoFluxo;
  saidas: GrupoFluxo;
  resultadoMes: number[];
  saldoAcumulado: number[];
  saldoInicial: number;
};

export function montarFluxoCaixa(categorias: CategoriaFC[], itens: ItemFluxo[], saldoInicial: number): FluxoCaixa {
  const catPorId = new Map(categorias.map((c) => [c.id, c]));

  function grupo(titulo: "Entradas" | "Saídas", tipo: "RECEBER" | "PAGAR"): GrupoFluxo {
    const porCat = new Map<string, number[]>();
    for (const it of itens) {
      if (it.tipo !== tipo || !catPorId.has(it.categoriaId) || it.mes < 1 || it.mes > 12) continue;
      const arr = porCat.get(it.categoriaId) ?? Array<number>(12).fill(0);
      arr[it.mes - 1] = (arr[it.mes - 1] ?? 0) + it.valor;
      porCat.set(it.categoriaId, arr);
    }
    const linhas: LinhaFluxo[] = [];
    for (const [id, valores] of porCat) {
      const arred = valores.map(r2);
      if (arred.every((v) => v === 0)) continue;
      const cat = catPorId.get(id)!;
      linhas.push({ categoriaId: id, nome: cat.nome, valores: arred, total: r2(arred.reduce((a, b) => a + b, 0)) });
    }
    linhas.sort((a, b) => {
      const ca = catPorId.get(a.categoriaId)!;
      const cb = catPorId.get(b.categoriaId)!;
      return ca.ordem_dre - cb.ordem_dre || a.nome.localeCompare(b.nome);
    });
    const totais = Array.from({ length: 12 }, (_, m) => r2(linhas.reduce((s, l) => s + (l.valores[m] ?? 0), 0)));
    return { titulo, linhas, totais, total: r2(totais.reduce((a, b) => a + b, 0)) };
  }

  const entradas = grupo("Entradas", "RECEBER");
  const saidas = grupo("Saídas", "PAGAR");
  const resultadoMes = Array.from({ length: 12 }, (_, m) => r2((entradas.totais[m] ?? 0) - (saidas.totais[m] ?? 0)));
  const saldoAcumulado: number[] = [];
  let acc = saldoInicial;
  for (let m = 0; m < 12; m++) {
    acc = r2(acc + (resultadoMes[m] ?? 0));
    saldoAcumulado.push(acc);
  }
  return { entradas, saidas, resultadoMes, saldoAcumulado, saldoInicial: r2(saldoInicial) };
}
