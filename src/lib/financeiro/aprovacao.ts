// Requer aprovação quando há alçada e o valor a ultrapassa.
export function requerAprovacao(valor: number, alcada: number | null): boolean {
  return alcada != null && valor > alcada;
}

// Segregação: só admin aprova, e nunca a despesa que ele mesmo lançou.
export function podeAprovar(papel: string, perfilId: string, criadoPor: string | null): boolean {
  return papel === "admin" && perfilId !== criadoPor;
}
