// Cálculo puro do percentual de reajuste. Cada índice do BACEN tem uma matemática diferente:
// o salário mínimo vem como valor absoluto (razão de valores); IPCA/IGP-M/INPC vêm como variação
// mensal (produtório). Determinístico e testável — é aqui que o erro moraria.

export type PontoSerie = { data: string; valor: string }; // "01/01/2026", "1621.00"

// mês/ano de "DD/MM/AAAA"
function mesAno(data: string): { mes: number; ano: number } {
  const [, mes, ano] = data.split("/");
  return { mes: Number(mes), ano: Number(ano) };
}

// jan/N ÷ dez/(N-1) - 1, em %.
export function variacaoSalarioMinimo(serie: PontoSerie[], ano: number): number {
  let dez: number | undefined;
  let jan: number | undefined;
  for (const p of serie) {
    const { mes, ano: a } = mesAno(p.data);
    if (mes === 12 && a === ano - 1) dez = Number(p.valor);
    if (mes === 1 && a === ano) jan = Number(p.valor);
  }
  if (dez === undefined || jan === undefined || dez === 0) {
    throw new Error("Série do salário mínimo incompleta para o ano.");
  }
  return (jan / dez - 1) * 100;
}

// Produtório de (1 + var/100), -1, em %.
export function variacaoAcumulada(serie: PontoSerie[]): number {
  let fator = 1;
  for (const p of serie) fator *= 1 + Number(p.valor) / 100;
  return (fator - 1) * 100;
}

export function aplicarPercentual(valorAtual: number, percentual: number): number {
  return Math.round(valorAtual * (1 + percentual / 100) * 100) / 100;
}
