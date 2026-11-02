export function podeCancelarBoleto(status: string): boolean {
  return status === "emitido";
}

export function podeCancelarTitulo(status: string, somaBaixado: number): boolean {
  return (status === "ABERTO" || status === "VENCIDO") && somaBaixado <= 0;
}

// Um vínculo `boleto_titulo` só impede nova emissão enquanto o boleto dele estiver de pé.
// Cancelado ou com erro, não impede — senão cancelar um boleto de grupo seria porta de mão
// única: os vínculos continuam na tabela e a emissão seguinte seria recusada para sempre.
// Status desconhecido bloqueia: diante de dúvida, não emitir é mais seguro que cobrar duas vezes.
export function boletoBloqueiaReemissao(status: string): boolean {
  return status !== "cancelado" && status !== "erro";
}
