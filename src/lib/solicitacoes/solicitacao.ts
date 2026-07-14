import { somarDias } from "@/lib/onboarding/processo";

export type SolicitacaoCategoria = "guia" | "documento" | "duvida" | "outro";
export type SolicitacaoStatus = "aberta" | "em_andamento" | "respondida" | "resolvida";

export const SOLICITACAO_CATEGORIAS: { valor: SolicitacaoCategoria; rotulo: string }[] = [
  { valor: "guia", rotulo: "Guia" },
  { valor: "documento", rotulo: "Documento" },
  { valor: "duvida", rotulo: "Dúvida" },
  { valor: "outro", rotulo: "Outro" },
];

export const SOLICITACAO_STATUS: { valor: SolicitacaoStatus; rotulo: string }[] = [
  { valor: "aberta", rotulo: "Aberta" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "respondida", rotulo: "Respondida" },
  { valor: "resolvida", rotulo: "Resolvida" },
];

export function rotuloCategoria(c: SolicitacaoCategoria): string {
  return SOLICITACAO_CATEGORIAS.find((x) => x.valor === c)?.rotulo ?? c;
}
export function rotuloStatus(s: SolicitacaoStatus): string {
  return SOLICITACAO_STATUS.find((x) => x.valor === s)?.rotulo ?? s;
}

// Prazo do SLA. Calculado SEMPRE no servidor — nunca vem do formulário.
export function prazoSla(hojeIso: string, slaDias: number): string {
  const dias = Number.isFinite(slaDias) && slaDias > 0 ? Math.floor(slaDias) : 0;
  return somarDias(hojeIso, dias);
}

// Solicitação resolvida não tem severidade de prazo.
export function contaPrazo(status: SolicitacaoStatus): boolean {
  return status !== "resolvida";
}
