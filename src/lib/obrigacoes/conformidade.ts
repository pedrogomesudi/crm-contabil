export type StatusConformidade = "no_prazo" | "com_atraso" | "pendente_vencida" | "pendente_no_prazo" | "dispensada";
type Inst = { status: string; entregueEm: string | null; vencimentoLegal: string };

export function classificarConformidade(inst: Inst, hoje: string): StatusConformidade {
  if (inst.status === "dispensada") return "dispensada";
  if (inst.entregueEm !== null) return inst.entregueEm <= inst.vencimentoLegal ? "no_prazo" : "com_atraso";
  return inst.vencimentoLegal < hoje ? "pendente_vencida" : "pendente_no_prazo";
}

export type ResumoConformidade = {
  total: number;
  noPrazo: number;
  comAtraso: number;
  pendenteVencida: number;
  pendenteNoPrazo: number;
  dispensada: number;
  pctConformidade: number;
};

export function resumirConformidade(itens: Inst[], hoje: string): ResumoConformidade {
  const r: ResumoConformidade = {
    total: itens.length,
    noPrazo: 0,
    comAtraso: 0,
    pendenteVencida: 0,
    pendenteNoPrazo: 0,
    dispensada: 0,
    pctConformidade: 100,
  };
  for (const it of itens) {
    const c = classificarConformidade(it, hoje);
    if (c === "no_prazo") r.noPrazo += 1;
    else if (c === "com_atraso") r.comAtraso += 1;
    else if (c === "pendente_vencida") r.pendenteVencida += 1;
    else if (c === "pendente_no_prazo") r.pendenteNoPrazo += 1;
    else r.dispensada += 1;
  }
  const base = r.total - r.dispensada;
  r.pctConformidade = base > 0 ? Math.round((r.noPrazo / base) * 100) : 100;
  return r;
}
