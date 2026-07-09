import type { EtapaOportunidade } from "./funil";

export type Granularidade = "mes" | "trimestre" | "semestre" | "ano";
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function periodoBounds(g: Granularidade, hojeIso: string, offset: number): { inicio: string; fim: string; rotulo: string } {
  const partes = hojeIso.split("-");
  const y = Number(partes[0]);
  const mes0 = Number(partes[1]) - 1;
  let inicioY: number, inicioM0: number, meses: number, rotulo: string;
  if (g === "mes") {
    const tot = y * 12 + mes0 + offset;
    inicioY = Math.floor(tot / 12); inicioM0 = ((tot % 12) + 12) % 12; meses = 1;
    rotulo = `${MESES[inicioM0]!} ${inicioY}`;
  } else if (g === "trimestre") {
    const tot = y * 12 + Math.floor(mes0 / 3) * 3 + offset * 3;
    inicioY = Math.floor(tot / 12); inicioM0 = ((tot % 12) + 12) % 12; meses = 3;
    rotulo = `${Math.floor(inicioM0 / 3) + 1}º trimestre ${inicioY}`;
  } else if (g === "semestre") {
    const tot = y * 12 + Math.floor(mes0 / 6) * 6 + offset * 6;
    inicioY = Math.floor(tot / 12); inicioM0 = ((tot % 12) + 12) % 12; meses = 6;
    rotulo = `${Math.floor(inicioM0 / 6) + 1}º semestre ${inicioY}`;
  } else {
    inicioY = y + offset; inicioM0 = 0; meses = 12;
    rotulo = `${inicioY}`;
  }
  const inicio = new Date(Date.UTC(inicioY, inicioM0, 1)).toISOString();
  const fim = new Date(Date.UTC(inicioY, inicioM0 + meses, 1)).toISOString();
  return { inicio, fim, rotulo };
}

export type OpMetrica = { etapa: EtapaOportunidade; valorEstimado: number | null; responsavelNome: string | null; motivoPerda: string | null; fechadoEm: string | null };
export type MetricasFunil = {
  pipeline: { total: { qtd: number; total: number }; porEtapa: Record<string, { qtd: number; total: number }> };
  periodo: {
    ganhos: { qtd: number; valor: number };
    perdidos: { qtd: number; valor: number };
    taxaConversao: number;
    porResponsavel: { nome: string; ganhos: number; perdidos: number; valorGanho: number }[];
    motivosPerda: { motivo: string; qtd: number }[];
  };
};

const ATIVAS = ["novo", "contato", "proposta", "negociacao"];

export function metricasFunil(ops: OpMetrica[], inicio: string, fim: string): MetricasFunil {
  const porEtapa: Record<string, { qtd: number; total: number }> = {};
  for (const e of ATIVAS) porEtapa[e] = { qtd: 0, total: 0 };
  let totQ = 0, totV = 0;
  for (const o of ops) {
    if (o.etapa === "ganho" || o.etapa === "perdido") continue;
    if (porEtapa[o.etapa]) { porEtapa[o.etapa]!.qtd += 1; porEtapa[o.etapa]!.total += o.valorEstimado ?? 0; }
    totQ += 1; totV += o.valorEstimado ?? 0;
  }
  const fechados = ops.filter((o) => (o.etapa === "ganho" || o.etapa === "perdido") && o.fechadoEm != null && o.fechadoEm >= inicio && o.fechadoEm < fim);
  const soma = (arr: OpMetrica[]) => arr.reduce((s, o) => s + (o.valorEstimado ?? 0), 0);
  const ganhosArr = fechados.filter((o) => o.etapa === "ganho");
  const perdidosArr = fechados.filter((o) => o.etapa === "perdido");
  const ganhos = { qtd: ganhosArr.length, valor: soma(ganhosArr) };
  const perdidos = { qtd: perdidosArr.length, valor: soma(perdidosArr) };
  const den = ganhos.qtd + perdidos.qtd;
  const taxaConversao = den > 0 ? ganhos.qtd / den : 0;
  const rmap = new Map<string, { nome: string; ganhos: number; perdidos: number; valorGanho: number }>();
  for (const o of fechados) {
    const nome = o.responsavelNome ?? "—";
    const r = rmap.get(nome) ?? { nome, ganhos: 0, perdidos: 0, valorGanho: 0 };
    if (o.etapa === "ganho") { r.ganhos += 1; r.valorGanho += o.valorEstimado ?? 0; } else r.perdidos += 1;
    rmap.set(nome, r);
  }
  const porResponsavel = [...rmap.values()].sort((a, b) => b.valorGanho - a.valorGanho);
  const mmap = new Map<string, number>();
  for (const o of perdidosArr) { const mo = o.motivoPerda ?? "Sem motivo"; mmap.set(mo, (mmap.get(mo) ?? 0) + 1); }
  const motivosPerda = [...mmap.entries()].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd);
  return { pipeline: { total: { qtd: totQ, total: totV }, porEtapa }, periodo: { ganhos, perdidos, taxaConversao, porResponsavel, motivosPerda } };
}
