import { competenciaParaData } from "./taxonomia";

export type FiltroResolvido = {
  nome?: string;
  tipoId?: string;
  departamento?: string;
  clienteId?: string;
  competencia?: string;
  compInicio?: string;
  compFim?: string;
};

// "2026-12" -> "2027-01-01"; "2026-07" -> "2026-08-01".
function primeiroDiaMesSeguinte(aaaaMM: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(aaaaMM);
  if (!m) return null;
  let ano = Number(m[1]);
  let mes = Number(m[2]) + 1;
  if (mes > 12) {
    mes = 1;
    ano += 1;
  }
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export function lerFiltroBusca(sp: Record<string, string | undefined>): FiltroResolvido {
  const nome = (sp.nome ?? "").trim().slice(0, 100) || undefined;
  const tipoId = (sp.tipo ?? "").trim() || undefined;
  const departamento = (sp.departamento ?? "").trim() || undefined;
  const clienteId = (sp.cliente ?? "").trim() || undefined;
  const competencia = /^\d{4}-\d{2}$/.test(sp.competencia ?? "") ? sp.competencia : undefined;
  const compInicio = competencia ? (competenciaParaData(competencia) ?? undefined) : undefined;
  const compFim = competencia ? (primeiroDiaMesSeguinte(competencia) ?? undefined) : undefined;
  return { nome, tipoId, departamento, clienteId, competencia, compInicio, compFim };
}
