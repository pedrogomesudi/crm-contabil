export type EstadoReceita = { situacao: string | null; optanteSimples: boolean | null };
export type AlertaDetectado = { tipo: "situacao" | "simples"; de: string; para: string };

const norm = (s: string | null) => (s ?? "").trim().toUpperCase();
const simNao = (b: boolean) => (b ? "Sim" : "Não");

// Compara o estado anterior (persistido) com o recém-consultado e devolve os alertas.
export function detectarMudancas(anterior: EstadoReceita, atual: EstadoReceita): AlertaDetectado[] {
  const alertas: AlertaDetectado[] = [];

  // Situação: 1ª observação só alerta se não for ATIVA; depois, qualquer transição.
  if (atual.situacao !== null) {
    if (anterior.situacao === null) {
      if (norm(atual.situacao) !== "ATIVA") {
        alertas.push({ tipo: "situacao", de: "—", para: atual.situacao });
      }
    } else if (norm(anterior.situacao) !== norm(atual.situacao)) {
      alertas.push({ tipo: "situacao", de: anterior.situacao, para: atual.situacao });
    }
  }

  // Simples: só com baseline; alerta em qualquer mudança (exclusão é o caso-ouro).
  if (
    anterior.optanteSimples !== null &&
    atual.optanteSimples !== null &&
    anterior.optanteSimples !== atual.optanteSimples
  ) {
    alertas.push({ tipo: "simples", de: simNao(anterior.optanteSimples), para: simNao(atual.optanteSimples) });
  }

  return alertas;
}
