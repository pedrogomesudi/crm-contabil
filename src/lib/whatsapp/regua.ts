export type EtapaAtiva = { id: string; dias_offset: number; template: string };

const MS_DIA = 86_400_000;

// (hoje − vencimento) em dias inteiros. Positivo = vencido; negativo = a vencer.
export function diffDias(hoje: string, vencimento: string): number {
  const h = Date.parse(`${hoje.slice(0, 10)}T00:00:00Z`);
  const v = Date.parse(`${vencimento.slice(0, 10)}T00:00:00Z`);
  return Math.round((h - v) / MS_DIA);
}

// A etapa ativa cujo offset bate exatamente com o dia; senão null.
export function etapaDoDia(etapas: EtapaAtiva[], hoje: string, vencimento: string): EtapaAtiva | null {
  const dias = diffDias(hoje, vencimento);
  return etapas.find((e) => e.dias_offset === dias) ?? null;
}
