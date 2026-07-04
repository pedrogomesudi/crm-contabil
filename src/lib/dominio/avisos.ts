// Alerta quando o arquivo de contratos foi enviado mas NENHUM contrato vinculou a
// um cliente. É o sintoma clássico do relatório "Clientes" errado/ausente: o
// código que liga contrato→cliente vem SÓ desse relatório. Sem vínculo, nenhum
// honorário é importado e honorários já cadastrados podem ser zerados na aplicação.
// Vínculo parcial NÃO alerta: contratos de clientes fora deste lote são normais.
export function avisoContratosNaoVinculados(
  clientesComContrato: number,
  clientesVinculados: number,
): string | null {
  if (clientesComContrato > 0 && clientesVinculados === 0) {
    return (
      `O arquivo de contratos traz ${clientesComContrato} cliente(s) com contrato, mas NENHUM foi vinculado. ` +
      `Isso quase sempre significa que o relatório "Clientes" correto (com código do cliente e CNPJ) não foi enviado — ` +
      `é dele que sai o código que liga contrato a cliente. Sem ele, nenhum honorário será importado e honorários já ` +
      `cadastrados podem ser zerados nesta aplicação. Reenvie o relatório "Clientes" e refaça a prévia.`
    );
  }
  return null;
}
