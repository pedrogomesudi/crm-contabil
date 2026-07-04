export function saldoTitulo(valor: number, somaBaixado: number): number {
  return Math.max(0, Number((valor - somaBaixado).toFixed(2)));
}

// VENCIDO é derivado (não persistido): vencimento no passado e ainda há saldo em aberto.
export function ehVencido(vencimento: string, status: string, saldo: number): boolean {
  if (status === "BAIXADO" || status === "CANCELADO") return false;
  if (saldo <= 0) return false;
  return vencimento < new Date().toISOString().slice(0, 10);
}

export const LABEL_STATUS: Record<string, string> = {
  ABERTO: "Em aberto",
  VENCIDO: "Vencido",
  BAIXADO: "Recebido",
  BAIXADO_PARCIAL: "Recebido parcial",
  CANCELADO: "Cancelado",
};
