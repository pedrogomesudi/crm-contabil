export function mesesEfetivos(tipoMeses: number | null, global: number): number {
  return tipoMeses ?? global;
}

export function descreverRetencao(tipoMeses: number | null, global: number): string {
  return tipoMeses != null ? `${tipoMeses} meses` : `${global} meses (padrão)`;
}
