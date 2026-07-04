export type ZapiConfig = { instance: string; token: string; clientToken: string };

const BASE = "https://api.z-api.io";

// Monta a requisição de envio de texto (puro, testável).
export function montarEnvio(cfg: ZapiConfig, telefone: string, texto: string): {
  url: string;
  headers: Record<string, string>;
  body: string;
} {
  return {
    url: `${BASE}/instances/${cfg.instance}/token/${cfg.token}/send-text`,
    headers: { "Content-Type": "application/json", "Client-Token": cfg.clientToken },
    body: JSON.stringify({ phone: telefone, message: texto }),
  };
}

async function comTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function enviarTexto(
  cfg: ZapiConfig,
  telefone: string,
  texto: string,
): Promise<{ ok: boolean; erro?: string; resposta?: unknown }> {
  const req = montarEnvio(cfg, telefone, texto);
  try {
    return await comTimeout(async (signal) => {
      const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body, signal });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, erro: `Z-API HTTP ${res.status}`, resposta: corpo };
      return { ok: true, resposta: corpo };
    });
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.name === "AbortError" ? "Tempo esgotado." : "Erro de rede." };
  }
}

export async function statusConexao(cfg: ZapiConfig): Promise<{ conectado: boolean; erro?: string }> {
  try {
    return await comTimeout(async (signal) => {
      const res = await fetch(`${BASE}/instances/${cfg.instance}/token/${cfg.token}/status`, {
        headers: { "Client-Token": cfg.clientToken },
        signal,
      });
      if (!res.ok) return { conectado: false, erro: `Z-API HTTP ${res.status}` };
      const d = (await res.json().catch(() => null)) as { connected?: boolean } | null;
      return { conectado: Boolean(d?.connected) };
    });
  } catch {
    return { conectado: false, erro: "Erro de rede." };
  }
}
