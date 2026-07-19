export type EtapaFollowup = { id: string; diasOffset: number; ativa: boolean };

// Data devida (YYYY-MM-DD) = dia UTC de enviadaEm + diasOffset.
function dataDevida(enviadaEm: string, diasOffset: number): string {
  const d = new Date(enviadaEm);
  d.setUTCDate(d.getUTCDate() + diasOffset);
  return d.toISOString().slice(0, 10);
}

export function etapasDevidas(
  enviadaEm: string,
  etapas: EtapaFollowup[],
  jaEnviadas: string[],
  hoje: string,
): EtapaFollowup[] {
  return etapas.filter((e) => e.ativa && !jaEnviadas.includes(e.id) && dataDevida(enviadaEm, e.diasOffset) <= hoje);
}

export function aplicarVariaveis(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k]! : m));
}
