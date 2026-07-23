import { extensaoPorMime } from "@/lib/whatsapp/inbox";
import type { MidiaEnvio, ProvedorWhatsapp } from "./tipos";
export type { MidiaEnvio } from "./tipos";

export type ZapiConfig = { instance: string; token: string; clientToken: string };

const BASE = "https://api.z-api.io";

// Monta a requisição de envio de texto (puro, testável).
export function montarEnvio(
  cfg: ZapiConfig,
  telefone: string,
  texto: string,
): {
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

// Monta a requisição de envio de mídia (puro, testável). image → /send-image; document → /send-document/{ext}.
export function montarEnvioMidia(
  cfg: ZapiConfig,
  telefone: string,
  midia: MidiaEnvio,
): { url: string; headers: Record<string, string>; body: string } {
  const headers = { "Content-Type": "application/json", "Client-Token": cfg.clientToken };
  const dataUri = `data:${midia.mime};base64,${midia.base64}`;
  const base = `${BASE}/instances/${cfg.instance}/token/${cfg.token}`;
  if (midia.tipo === "image") {
    return {
      url: `${base}/send-image`,
      headers,
      body: JSON.stringify({ phone: telefone, image: dataUri, caption: midia.caption }),
    };
  }
  return {
    url: `${base}/send-document/${extensaoPorMime(midia.mime)}`,
    headers,
    body: JSON.stringify({ phone: telefone, document: dataUri, fileName: midia.nome, caption: midia.caption }),
  };
}

export async function enviarMidiaZapi(
  cfg: ZapiConfig,
  telefone: string,
  midia: MidiaEnvio,
): Promise<{ ok: boolean; erro?: string; resposta?: unknown }> {
  const req = montarEnvioMidia(cfg, telefone, midia);
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

// Adaptador Z-API para a interface ProvedorWhatsapp — fecha sobre a config decifrada.
export function criarAdaptadorZapi(cfg: ZapiConfig): ProvedorWhatsapp {
  return {
    // A Z-API não tem janela nem template: texto livre sempre. É opção permanente,
    // não legado — a camada proativa preserva exatamente este comportamento.
    exigeTemplateForaDaJanela: false,
    enviarTexto: (telefone, texto) => enviarTexto(cfg, telefone, texto),
    enviarMidia: (telefone, midia) => enviarMidiaZapi(cfg, telefone, midia),
    statusConexao: () => statusConexao(cfg),
  };
}
