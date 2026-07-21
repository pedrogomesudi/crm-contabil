export type Vigencia = { custoHora: number; inicio: string; fim: string | null };

export type LinhaRentab = {
  clienteId: string;
  clienteNome: string;
  regime: string | null;
  porte: string | null;
  minutos: number;
  custo: number;
  recebido: number;
  contratado: number;
  semApontamento: boolean;
  semCusto: boolean;
};

// O custo é o VIGENTE NA DATA DO APONTAMENTO, nunca o de hoje: senão um aumento de salário
// reescreveria a rentabilidade do passado, e comparar períodos deixaria de fazer sentido.
export function custoHoraNaData(vigencias: Vigencia[], dataIso: string): number | null {
  const d = dataIso.slice(0, 10);
  const v = vigencias.find((x) => x.inicio <= d && (x.fim === null || x.fim >= d));
  return v ? v.custoHora : null;
}

// Sem custo cadastrado o valor é 0 — mas quem chama MARCA `semCusto`. Custo zero não pode
// passar por "colaborador barato".
export function custoDoApontamento(minutos: number, custoHora: number | null): number {
  if (custoHora === null) return 0;
  return (minutos / 60) * custoHora;
}

export function margem(l: { custo: number; recebido: number; minutos: number }): {
  valor: number;
  pct: number | null;
  porHora: number | null;
} {
  const valor = l.recebido - l.custo;
  // Recebido zero não vira Infinity nem NaN — vira "não dá para calcular".
  const pct = l.recebido > 0 ? Math.round((valor / l.recebido) * 100) : null;
  const porHora = l.minutos > 0 ? l.recebido / (l.minutos / 60) : null;
  return { valor, pct, porHora };
}

export function mesesNoPeriodo(deIso: string, ateIso: string): number {
  const [a1, m1] = deIso.slice(0, 7).split("-").map(Number);
  const [a2, m2] = ateIso.slice(0, 7).split("-").map(Number);
  return (a2 ?? 0) * 12 + (m2 ?? 0) - ((a1 ?? 0) * 12 + (m1 ?? 0)) + 1;
}

// Pior margem primeiro: o relatório existe para achar cliente ruim, não para admirar o bom.
export function ordenarPorMargem(linhas: LinhaRentab[]): LinhaRentab[] {
  return [...linhas].sort((a, b) => margem(a).valor - margem(b).valor);
}
