import { aplicarPercentual } from "./indice";

export type ClienteReajuste = {
  clienteId: string;
  nome: string;
  valorAtual: number;
  indice: string;
  percentualFixo: number | null;
};

export type LinhaReajuste = {
  clienteId: string;
  nome: string;
  valorAtual: number;
  indice: string;
  percentual: number;
  valorNovo: number;
  marcada: boolean;
};

// Monta as linhas da simulação. `percentuais` traz índice -> % (buscado do BACEN pela action).
// PERCENTUAL_FIXO usa o percentual do cadastro. Percentual 0 (índice indisponível) desmarca a linha.
export function montarSimulacao(clientes: ClienteReajuste[], percentuais: Record<string, number>): LinhaReajuste[] {
  return clientes.map((c) => {
    const pct = c.indice === "PERCENTUAL_FIXO" ? (c.percentualFixo ?? 0) : (percentuais[c.indice] ?? 0);
    return {
      clienteId: c.clienteId,
      nome: c.nome,
      valorAtual: c.valorAtual,
      indice: c.indice,
      percentual: pct,
      valorNovo: aplicarPercentual(c.valorAtual, pct),
      marcada: pct !== 0,
    };
  });
}
