// Lógica pura da ferramenta de status dos tenants (semver + classificação). Sem I/O.

export function compararVersao(a, b) {
  const partes = (v) =>
    String(v ?? "")
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// health = { ok: boolean, versao: string|null }; esperado = string|null.
export function classificar(health, esperado) {
  if (!health.ok) return "fora do ar";
  if (esperado) return compararVersao(health.versao, esperado) < 0 ? "desatualizado" : "atualizado";
  return "ok";
}

export function resumo(linhas) {
  return {
    total: linhas.length,
    fora: linhas.filter((l) => l.status === "fora do ar").length,
    desatualizados: linhas.filter((l) => l.status === "desatualizado").length,
  };
}
