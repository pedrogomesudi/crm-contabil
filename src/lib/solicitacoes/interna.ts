export type SolicInternaStatus = "aberta" | "em_andamento" | "respondida" | "resolvida";

export const SOLIC_INTERNA_STATUS: { valor: SolicInternaStatus; rotulo: string }[] = [
  { valor: "aberta", rotulo: "Aberta" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "respondida", rotulo: "Respondida" },
  { valor: "resolvida", rotulo: "Resolvida" },
];

export const SLA_PADRAO_DIAS = 3;

export function rotuloStatusInterno(s: SolicInternaStatus): string {
  return SOLIC_INTERNA_STATUS.find((x) => x.valor === s)?.rotulo ?? s;
}

// Resolvida nunca conta como vencida: o trabalho acabou, cobrar prazo dele é ruído.
export function estaVencida(status: SolicInternaStatus, prazo: string | null, hoje: string): boolean {
  if (status === "resolvida") return false;
  if (!prazo) return false;
  return prazo < hoje;
}

export type ItemFila = {
  id: string;
  prazo: string | null;
  status: SolicInternaStatus;
  responsavelId: string | null;
};

// Vencidas primeiro; depois por prazo mais próximo; sem prazo por último.
export function ordenarFila<T extends ItemFila>(itens: T[], hoje: string): T[] {
  return [...itens].sort((a, b) => {
    const va = estaVencida(a.status, a.prazo, hoje) ? 0 : 1;
    const vb = estaVencida(b.status, b.prazo, hoje) ? 0 : 1;
    if (va !== vb) return va - vb;
    if (a.prazo === null) return b.prazo === null ? 0 : 1;
    if (b.prazo === null) return -1;
    return a.prazo.localeCompare(b.prazo);
  });
}

// Sem SLA cadastrado, cai no padrão — mas SINALIZA: a tela avisa, em vez de fingir que
// o prazo foi escolhido de propósito.
export function slaDoDepartamento(
  slas: { departamento: string; dias: number }[],
  depto: string,
): { dias: number; padrao: boolean } {
  const s = slas.find((x) => x.departamento === depto);
  return s ? { dias: s.dias, padrao: false } : { dias: SLA_PADRAO_DIAS, padrao: true };
}
