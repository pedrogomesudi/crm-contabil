// Resolve a URL de ping do healthchecks.io para um cron, a partir de um env JSON `{ [cron]: urlBase }`.
// Puro/defensivo: env ausente, JSON inválido ou nome sem url → null (ping vira no-op). `fail` acrescenta
// "/fail" à base (sem barra dupla).
export function urlDoHealthcheck(
  mapaJson: string | undefined,
  nome: string,
  estado: "success" | "fail",
): string | null {
  if (!mapaJson) return null;
  let mapa: Record<string, unknown>;
  try {
    mapa = JSON.parse(mapaJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  const base = mapa?.[nome];
  if (typeof base !== "string" || base.length === 0) return null;
  return estado === "fail" ? `${base.replace(/\/$/, "")}/fail` : base;
}

// Pinga o healthchecks.io. Best-effort: sem URL configurada é no-op, e um ping que falha NÃO
// propaga (não pode quebrar o cron).
export async function pingHealthcheck(nome: string, estado: "success" | "fail" = "success"): Promise<void> {
  const url = urlDoHealthcheck(process.env.HEALTHCHECK_URLS, nome, estado);
  if (!url) return;
  try {
    await fetch(url, { method: "POST", signal: AbortSignal.timeout(5000) });
  } catch {
    // best-effort: um ping não pode quebrar o cron.
  }
}

// Envolve o trabalho de um cron: pinga sucesso ao terminar; na exceção, pinga /fail e RE-LANÇA
// (para o 500 e o onRequestError continuarem valendo).
export async function executarCronComPing<T>(nome: string, trabalho: () => Promise<T>): Promise<T> {
  try {
    const resultado = await trabalho();
    await pingHealthcheck(nome, "success");
    return resultado;
  } catch (e) {
    await pingHealthcheck(nome, "fail");
    throw e;
  }
}
