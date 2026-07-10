// Métricas de carteira (RF-070): série mensal de MRR, ticket médio, churn e crescimento.
// Puro e testável — datas ISO (YYYY-MM-DD) comparadas por string (ordenáveis lexicograficamente).

import { honorarioEm, type VigenciaValor } from "./vigencia";

export type ClienteMetrica = {
  dataInicio: string | null; // entrada (null = presente desde antes da janela)
  dataSaida: string | null; // saída (null = ativo)
  vigencias: VigenciaValor[]; // histórico do honorário; resolvido mês a mês
  honorarioSaida: number | null; // fallback para cliente sem vigência alguma
};

export type MesMetrica = {
  mes: string; // "YYYY-MM"
  base: number; // ativos no início do mês
  novos: number; // entradas no mês
  churn: number; // saídas no mês
  liquido: number; // novos - churn
  ativosFim: number; // ativos ao fim do mês
  churnPct: number; // churn / base, em % (1 casa)
  churnReceita: number; // R$ de honorário perdido no mês
  mrr: number; // Σ honorário dos ativos ao fim do mês
  ticketMedio: number; // mrr / ativosFim
  estimado: boolean; // algum honorário que CONTRIBUIU no mês veio de vigência estimada/extrapolada
};

export type ResumoMetricas = {
  serie: MesMetrica[];
  atual: { mrr: number; ticketMedio: number; ativos: number; churnPct: number; churnReceita: number };
};

const cent = (n: number) => Math.round(n * 100) / 100;
const pct1 = (n: number) => Math.round(n * 1000) / 10; // fração → % com 1 casa

// N meses em ordem cronológica, terminando em refAnoMes ("YYYY-MM").
export function mesesJanela(refAnoMes: string, n: number): string[] {
  const partes = refAnoMes.split("-");
  const a = Number(partes[0]);
  const m = Number(partes[1]);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = a * 12 + (m - 1) - i;
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    out.push(`${ano}-${String(mes).padStart(2, "0")}`);
  }
  return out;
}

export function calcularMetricas(clientes: ClienteMetrica[], meses: string[]): ResumoMetricas {
  const serie: MesMetrica[] = meses.map((mes) => {
    const partes = mes.split("-");
    const a = Number(partes[0]);
    const m = Number(partes[1]);
    const ini = `${mes}-01`;
    const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    let base = 0,
      novos = 0,
      churn = 0,
      churnReceita = 0,
      mrr = 0,
      ativosFim = 0;
    let estimado = false;
    for (const c of clientes) {
      const r = honorarioEm(c.vigencias, mes);
      // Sem vigência alguma (cliente antigo já inativado), cai no honorário fotografado na saída.
      const hon = c.vigencias.length > 0 ? r.valor : (c.honorarioSaida ?? 0);
      const semRegistro = c.vigencias.length === 0 || r.estimado;

      const entrouAntes = !c.dataInicio || c.dataInicio < ini;
      const entrouNoMes = !!c.dataInicio && c.dataInicio >= ini && c.dataInicio < prox;
      const naoSaiuAteIni = !c.dataSaida || c.dataSaida >= ini;
      const saiuNoMes = !!c.dataSaida && c.dataSaida >= ini && c.dataSaida < prox;
      const ativoFim = (entrouAntes || entrouNoMes) && (!c.dataSaida || c.dataSaida >= prox);
      if (entrouAntes && naoSaiuAteIni) base += 1;
      if (entrouNoMes) novos += 1;
      if (saiuNoMes) {
        churn += 1;
        churnReceita += hon;
        if (semRegistro) estimado = true; // contribuiu com receita perdida: o selo conta
      }
      if (ativoFim) {
        ativosFim += 1;
        mrr += hon;
        if (semRegistro) estimado = true; // contribuiu com MRR: o selo conta
      }
    }
    mrr = cent(mrr);
    churnReceita = cent(churnReceita);
    const churnPct = base > 0 ? pct1(churn / base) : 0;
    const ticketMedio = ativosFim > 0 ? cent(mrr / ativosFim) : 0;
    return { mes, base, novos, churn, liquido: novos - churn, ativosFim, churnPct, churnReceita, mrr, ticketMedio, estimado };
  });
  const u = serie[serie.length - 1];
  const atual = u
    ? { mrr: u.mrr, ticketMedio: u.ticketMedio, ativos: u.ativosFim, churnPct: u.churnPct, churnReceita: u.churnReceita }
    : { mrr: 0, ticketMedio: 0, ativos: 0, churnPct: 0, churnReceita: 0 };
  return { serie, atual };
}
