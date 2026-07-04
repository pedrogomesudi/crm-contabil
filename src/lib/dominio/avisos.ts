// Alerta quando o arquivo de contratos foi enviado mas NENHUM contrato vinculou a
// um cliente. Como o vínculo é por nome (contrato -> razão social do Regime ->
// CNPJ), isso indica que o relatório "Regime de Empresas" está ausente ou que os
// nomes não batem. Sem vínculo, nenhum honorário é importado e honorários já
// cadastrados podem ser zerados na aplicação. Vínculo parcial NÃO alerta aqui.
export function avisoContratosNaoVinculados(
  clientesComContrato: number,
  clientesVinculados: number,
): string | null {
  if (clientesComContrato > 0 && clientesVinculados === 0) {
    return (
      `O arquivo de contratos traz ${clientesComContrato} cliente(s) com contrato, mas NENHUM foi vinculado. ` +
      `O vínculo é feito pelo nome do cliente contra a razão social do relatório "Regime de Empresas" (que traz o CNPJ) — ` +
      `confira se o Regime foi enviado junto e se os nomes conferem. Sem vínculo, nenhum honorário será importado e ` +
      `honorários já cadastrados podem ser zerados nesta aplicação.`
    );
  }
  return null;
}

// Lista os contratos que não puderam ser vinculados: nomes sem empresa
// correspondente e nomes ambíguos (mais de uma empresa com a mesma razão social).
// Esses clientes ficam sem honorário nesta importação — sinaliza para revisão.
export function avisoContratosNaoCasados(naoCasados: string[], ambiguos: string[]): string | null {
  const partes: string[] = [];
  if (naoCasados.length) {
    const lista = naoCasados.slice(0, 10).join("; ") + (naoCasados.length > 10 ? "; …" : "");
    partes.push(`${naoCasados.length} contrato(s) sem empresa correspondente pelo nome: ${lista}`);
  }
  if (ambiguos.length) {
    partes.push(`${ambiguos.length} nome(s) ambíguo(s) (mais de uma empresa com a mesma razão social): ${ambiguos.join("; ")}`);
  }
  if (!partes.length) return null;
  return (
    partes.join(" — ") +
    ". Esses clientes ficarão sem honorário nesta importação; confira a razão social no Domínio."
  );
}
