export function podeCancelarBoleto(status: string): boolean {
  return status === "emitido";
}

export function podeCancelarTitulo(status: string, somaBaixado: number): boolean {
  return (status === "ABERTO" || status === "VENCIDO") && somaBaixado <= 0;
}
