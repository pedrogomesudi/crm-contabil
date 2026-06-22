// Valida presença de env de forma explícita (falha cedo e clara).
// Recebe o VALOR (não o nome) para preservar o inlining estático das
// NEXT_PUBLIC_* pelo Next — process.env[nomeDinamico] não é inlined.
export function required(value: string | undefined, nome: string): string {
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${nome}`);
  }
  return value;
}
