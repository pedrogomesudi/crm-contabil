// Regras puras de elegibilidade e alçada da suspensão por inadimplência.
// tolerância null/0 = feature desligada; piso null = sem piso.
export const elegivelSuspensao = (
  diasAtraso: number,
  saldoDevedor: number,
  diasTolerancia: number | null,
  valorMinimo: number | null,
): boolean =>
  diasTolerancia != null &&
  diasTolerancia > 0 &&
  diasAtraso >= diasTolerancia &&
  saldoDevedor > 0 &&
  (valorMinimo == null || saldoDevedor >= valorMinimo);

// financeiro (e admin) suspende; apenas admin reativa (a alçada).
export const podeSuspender = (papel: string): boolean => papel === "admin" || papel === "financeiro";
export const podeReativar = (papel: string): boolean => papel === "admin";

export const motivoValido = (motivo: string): boolean => motivo.trim().length > 0;
