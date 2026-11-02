// Campos que um boleto gravado precisa ter para ser utilizável. O registro no provedor é
// assíncrono: a emissão pode gravar a linha antes de o banco publicá-la. Puro/testável.
export type CamposBoleto = {
  nosso_numero: string | null;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
};

export function boletoIncompleto(b: CamposBoleto): boolean {
  return !b.linha_digitavel || !b.nosso_numero;
}

// O que gravar na reconsulta: só os campos que estão vazios e voltaram preenchidos. Nunca
// sobrescreve dado existente — o que já está no boleto é o que foi enviado ao cliente.
export function camposACompletar(
  atual: CamposBoleto,
  lido: { nossoNumero: string | null; linhaDigitavel: string | null; pixCopiaCola: string | null },
): Partial<CamposBoleto> {
  const out: Partial<CamposBoleto> = {};
  if (!atual.nosso_numero && lido.nossoNumero) out.nosso_numero = lido.nossoNumero;
  if (!atual.linha_digitavel && lido.linhaDigitavel) out.linha_digitavel = lido.linhaDigitavel;
  if (!atual.pix_copia_cola && lido.pixCopiaCola) out.pix_copia_cola = lido.pixCopiaCola;
  return out;
}
