// O explícito manda; null cai na derivação atual.
export function resolverFlag(explicito: boolean | null, derivado: boolean): boolean {
  return explicito ?? derivado;
}
