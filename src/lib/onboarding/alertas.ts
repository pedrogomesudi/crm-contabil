export type SeveridadeAlerta = "em_breve" | "vencido" | "critico";

export function classificarAlerta(prazo: string, hoje: string, janelaDias = 3): SeveridadeAlerta | null {
  const pz = Date.parse(`${prazo}T00:00:00Z`);
  const hj = Date.parse(`${hoje}T00:00:00Z`);
  if (Number.isNaN(pz) || Number.isNaN(hj)) return null;
  const d = Math.round((pz - hj) / 86400000);
  if (d > janelaDias) return null;
  if (d >= 0) return "em_breve";
  if (d >= -7) return "vencido";
  return "critico";
}

export function ordemSeveridade(sev: SeveridadeAlerta): number {
  return sev === "critico" ? 0 : sev === "vencido" ? 1 : 2;
}
