import type { ProvedorWhatsapp } from "./tipos";

export type OficialConfig = { phoneNumberId: string; token: string; versao?: string };

const VERSAO_PADRAO = "v21.0";
function baseUrl(cfg: OficialConfig): string {
  return `https://graph.facebook.com/${cfg.versao ?? VERSAO_PADRAO}`;
}

// Monta o envio de texto da Cloud API (puro, testável).
export function montarEnvioTextoOficial(
  cfg: OficialConfig,
  telefone: string,
  texto: string,
): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: `${baseUrl(cfg)}/${cfg.phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefone,
      type: "text",
      text: { preview_url: false, body: texto },
    }),
  };
}

// Adaptador da API oficial (Cloud API). Texto + status; mídia entra na Fatia 1C.
export function criarAdaptadorOficial(cfg: OficialConfig): ProvedorWhatsapp {
  return {
    enviarTexto: async (telefone, texto) => {
      const req = montarEnvioTextoOficial(cfg, telefone, texto);
      try {
        const res = await fetch(req.url, {
          method: "POST",
          headers: req.headers,
          body: req.body,
          signal: AbortSignal.timeout(15000),
        });
        const corpo = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, erro: `WhatsApp oficial HTTP ${res.status}`, resposta: corpo };
        return { ok: true, resposta: corpo };
      } catch (e) {
        return {
          ok: false,
          erro: e instanceof Error && e.name === "TimeoutError" ? "Tempo esgotado." : "Erro de rede.",
        };
      }
    },
    enviarMidia: async () => ({
      ok: false,
      erro: "Envio de mídia pela API oficial ainda não disponível (em breve).",
    }),
    statusConexao: async () => {
      try {
        const res = await fetch(`${baseUrl(cfg)}/${cfg.phoneNumberId}`, {
          headers: { Authorization: `Bearer ${cfg.token}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { conectado: false, erro: `WhatsApp oficial HTTP ${res.status}` };
        return { conectado: true };
      } catch {
        return { conectado: false, erro: "Erro de rede." };
      }
    },
  };
}
