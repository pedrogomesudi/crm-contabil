export type ModoFator = "faixas" | "unidade";
export type Fator = {
  modo: ModoFator;
  valorUnitario: number;
  franquia: number;
  faixas: { ate: number | null; valor: number }[];
};
export type ConfigPreco = {
  baseRegime: Record<string, number>;
  faturamento: Fator;
  funcionarios: Fator;
  notas: Fator;
  complexidades: { id: string; multiplicador: number }[];
  servicos: { id: string; valor: number; recorrencia: "mensal" | "unico" }[];
  valorMinimo: number;
  descontoMaximoPct: number;
};
export type Parametros = {
  regime: string;
  faturamento: number;
  funcionarios: number;
  notas: number;
  complexidadeId: string | null;
  servicoIds: string[];
  descontoPct: number;
};
export type Linha = { rotulo: string; valor: number };
export type Resultado = { mensal: number; unico: number; detalhamento: Linha[] };

export function acrescimoFator(fator: Fator, valor: number): number {
  if (fator.modo === "unidade") {
    return fator.valorUnitario * Math.max(0, valor - fator.franquia);
  }
  // faixas: na ordem dada, a primeira cuja 'ate' cobre o valor; a última (ate=null) é o resto.
  for (const f of fator.faixas) {
    if (f.ate == null || valor <= f.ate) return f.valor;
  }
  return 0;
}

export function multiplicador(complexidades: { id: string; multiplicador: number }[], id: string | null): number {
  if (!id) return 1;
  return complexidades.find((c) => c.id === id)?.multiplicador ?? 1;
}

export function calcularHonorario(p: Parametros, cfg: ConfigPreco): Resultado {
  const det: Linha[] = [];
  const base = cfg.baseRegime[p.regime] ?? 0;
  det.push({ rotulo: `Base (${p.regime})`, valor: base });

  const aFat = acrescimoFator(cfg.faturamento, p.faturamento);
  const aFunc = acrescimoFator(cfg.funcionarios, p.funcionarios);
  const aNotas = acrescimoFator(cfg.notas, p.notas);
  if (aFat) det.push({ rotulo: "Faturamento", valor: aFat });
  if (aFunc) det.push({ rotulo: "Funcionários", valor: aFunc });
  if (aNotas) det.push({ rotulo: "Notas", valor: aNotas });

  const mult = multiplicador(cfg.complexidades, p.complexidadeId);
  const subtotal = base + aFat + aFunc + aNotas;
  let recorrente = subtotal * mult;
  if (mult !== 1) det.push({ rotulo: `Complexidade (×${mult})`, valor: recorrente - subtotal });

  // Desconto e piso incidem SÓ no honorário (base + acréscimos × complexidade).
  const pct = Math.min(p.descontoPct, cfg.descontoMaximoPct);
  const desconto = recorrente * (pct / 100);
  if (desconto) det.push({ rotulo: `Desconto (${pct}%)`, valor: -desconto });
  recorrente -= desconto;

  let mensal = Math.max(cfg.valorMinimo, recorrente);
  if (mensal !== recorrente) det.push({ rotulo: "Piso aplicado", valor: mensal - recorrente });

  // Serviços entram DEPOIS do desconto/piso, sem desconto.
  const marcados = cfg.servicos.filter((s) => p.servicoIds.includes(s.id));
  for (const s of marcados.filter((s) => s.recorrencia === "mensal")) {
    mensal += s.valor;
    det.push({ rotulo: "Serviço (mensal)", valor: s.valor });
  }
  const unico = marcados.filter((s) => s.recorrencia === "unico").reduce((t, s) => t + s.valor, 0);

  return { mensal, unico, detalhamento: det };
}

export type EntradaConfig = {
  regimes: { regime: string; valorBase: number }[];
  fatores: {
    fator: string;
    modo: string;
    valorUnitario: number;
    franquia: number;
    faixas: { ate: number | null; valor: number }[];
  }[];
  complexidades: { id: string; multiplicador: number }[];
  servicos: { id: string; valor: number; recorrencia: string }[];
  global: { valorMinimo: number; descontoMaximoPct: number };
};

const FATOR_NEUTRO: Fator = { modo: "faixas", valorUnitario: 0, franquia: 0, faixas: [] };

function fatorDe(e: EntradaConfig, nome: string): Fator {
  const f = e.fatores.find((x) => x.fator === nome);
  if (!f) return { ...FATOR_NEUTRO };
  return {
    modo: f.modo === "unidade" ? "unidade" : "faixas",
    valorUnitario: f.valorUnitario,
    franquia: f.franquia,
    faixas: f.faixas.map((x) => ({ ate: x.ate, valor: x.valor })),
  };
}

// Mapeia a configuração vinda do banco (a view da tela de config) para o tipo que o motor consome.
export function paraConfigPreco(e: EntradaConfig): ConfigPreco {
  return {
    baseRegime: Object.fromEntries(e.regimes.map((r) => [r.regime, r.valorBase])),
    faturamento: fatorDe(e, "faturamento"),
    funcionarios: fatorDe(e, "funcionarios"),
    notas: fatorDe(e, "notas"),
    complexidades: e.complexidades.map((c) => ({ id: c.id, multiplicador: c.multiplicador })),
    servicos: e.servicos.map((s) => ({
      id: s.id,
      valor: s.valor,
      recorrencia: s.recorrencia === "mensal" ? "mensal" : "unico",
    })),
    valorMinimo: e.global.valorMinimo,
    descontoMaximoPct: e.global.descontoMaximoPct,
  };
}

export type ItemProposta = { descricao: string; valor: number; recorrencia: "mensal" | "unico" };
export type ServicoView = { id: string; nome: string; valor: number; recorrencia: "mensal" | "unico" };
export type SnapshotPreco = { params: Parametros; mensal: number; unico: number; detalhamento: Linha[] };

// Transforma um cálculo nos itens da proposta: o honorário consolidado (com desconto, sem serviços) +
// uma linha por serviço marcado (valor de tabela, sem desconto). O snapshot guarda o cálculo cheio.
export function itensProposta(
  p: Parametros,
  cfg: ConfigPreco,
  servicos: ServicoView[],
): { itens: ItemProposta[]; snapshot: SnapshotPreco } {
  const honorario = calcularHonorario({ ...p, servicoIds: [] }, cfg).mensal; // honorário sem serviços
  const cheio = calcularHonorario(p, cfg); // mensal/unico/detalhamento com serviços (para o snapshot)
  const itens: ItemProposta[] = [{ descricao: "Honorários contábeis", valor: honorario, recorrencia: "mensal" }];
  for (const s of servicos.filter((s) => p.servicoIds.includes(s.id))) {
    itens.push({ descricao: s.nome, valor: s.valor, recorrencia: s.recorrencia });
  }
  return {
    itens,
    snapshot: { params: p, mensal: cheio.mensal, unico: cheio.unico, detalhamento: cheio.detalhamento },
  };
}
