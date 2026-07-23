import type { MidiaEnvio, ProvedorWhatsapp, TemplateEnvio } from "./tipos";

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

// Monta o envio de mídia da Cloud API referenciando um media id já enviado (puro, testável).
export function montarEnvioMidiaOficial(
  cfg: OficialConfig,
  telefone: string,
  mediaId: string,
  midia: MidiaEnvio,
): { url: string; headers: Record<string, string>; body: string } {
  const conteudo =
    midia.tipo === "image"
      ? { image: { id: mediaId, caption: midia.caption } }
      : { document: { id: mediaId, caption: midia.caption, filename: midia.nome } };
  return {
    url: `${baseUrl(cfg)}/${cfg.phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefone, type: midia.tipo, ...conteudo }),
  };
}

// Monta o envio de template da Cloud API (puro, testável). Fora da janela de 24h a Meta só
// aceita template aprovado: o corpo é fixo pela aprovação e nós só preenchemos os parâmetros.
export function montarEnvioTemplateOficial(
  cfg: OficialConfig,
  telefone: string,
  t: TemplateEnvio,
): { url: string; headers: Record<string, string>; body: string } {
  const template: Record<string, unknown> = { name: t.nome, language: { code: t.idioma } };
  if (t.params.length > 0) {
    template.components = [{ type: "body", parameters: t.params.map((p) => ({ type: "text", text: p })) }];
  }
  return {
    url: `${baseUrl(cfg)}/${cfg.phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefone, type: "template", template }),
  };
}

// Adaptador da API oficial (Cloud API). Texto + mídia + template + status.
export function criarAdaptadorOficial(cfg: OficialConfig): ProvedorWhatsapp {
  return {
    exigeTemplateForaDaJanela: true,
    enviarTemplate: async (telefone, t) => {
      const req = montarEnvioTemplateOficial(cfg, telefone, t);
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
    enviarMidia: async (telefone, midia) => {
      try {
        // 1) Upload do arquivo → media id.
        const bytes = new Uint8Array(Buffer.from(midia.base64, "base64"));
        const form = new FormData();
        form.append("messaging_product", "whatsapp");
        form.append("type", midia.mime);
        form.append("file", new Blob([bytes], { type: midia.mime }), midia.nome);
        const up = await fetch(`${baseUrl(cfg)}/${cfg.phoneNumberId}/media`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.token}` },
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        const upBody = (await up.json().catch(() => null)) as { id?: string } | null;
        if (!up.ok || !upBody?.id) {
          return { ok: false, erro: `WhatsApp oficial HTTP ${up.status} (upload)`, resposta: upBody };
        }
        // 2) Envio referenciando o media id.
        const req = montarEnvioMidiaOficial(cfg, telefone, upBody.id, midia);
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
