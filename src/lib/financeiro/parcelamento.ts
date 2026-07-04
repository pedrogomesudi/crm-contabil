export type Parcela = { parcela: number; valor: number; vencimento: string; competencia: string };

// Soma `meses` a uma data YYYY-MM-DD, mantendo o dia (clampa ao último dia do mês alvo).
export function somarMeses(dataISO: string, meses: number): string {
  const y = Number(dataISO.slice(0, 4));
  const m = Number(dataISO.slice(5, 7));
  const d = Number(dataISO.slice(8, 10));
  const base = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth(); // 0-based
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Rateia `total` em `n` parcelas (centavos iguais; a última absorve a diferença),
// com vencimento e competência avançando mês a mês.
export function parcelas(total: number, n: number, primeiroVenc: string, competencia: string): Parcela[] {
  const base = Math.floor((total / n) * 100) / 100;
  const out: Parcela[] = [];
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    const ultima = i === n - 1;
    const valor = ultima ? Number((total - acumulado).toFixed(2)) : base;
    acumulado = Number((acumulado + valor).toFixed(2));
    out.push({
      parcela: i + 1,
      valor,
      vencimento: somarMeses(primeiroVenc, i),
      competencia: somarMeses(competencia, i),
    });
  }
  return out;
}
