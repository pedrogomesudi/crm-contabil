import type { EventoPagamento } from "./tipos";

export function dadosBaixaBoleto(
  evento: EventoPagamento,
  valorBoleto: number,
  hoje: string,
): { dataRecebimento: string; valorRecebido: number } {
  return {
    dataRecebimento: evento.pagoEm ? evento.pagoEm.slice(0, 10) : hoje,
    valorRecebido: evento.valorPago ?? valorBoleto,
  };
}
