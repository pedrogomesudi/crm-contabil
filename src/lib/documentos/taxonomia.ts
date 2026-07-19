// "2026-07" -> "2026-07-01"; vazio ou formato inválido (mês 1..12) -> null.
export function competenciaParaData(aaaaMM: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(aaaaMM.trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

// "2026-07-01" -> "07/2026"; null -> "—".
export function competenciaRotulo(data: string | null): string {
  if (!data) return "—";
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(data);
  return m ? `${m[2]}/${m[1]}` : "—";
}

// Departamento sugerido a partir do tipo escolhido (do catálogo); fallback null.
export function departamentoDoTipo(
  tipos: { id: string; departamento: string | null }[],
  tipoId: string,
): string | null {
  return tipos.find((t) => t.id === tipoId)?.departamento ?? null;
}
