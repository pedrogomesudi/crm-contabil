export type StatusTemplate = "aprovado" | "pendente" | "reprovado" | "outro";
export type TemplateMeta = { nome: string; idioma: string; status: StatusTemplate };

const MAPA: Record<string, StatusTemplate> = {
  APPROVED: "aprovado",
  PENDING: "pendente",
  REJECTED: "reprovado",
};

export function parseTemplatesMeta(json: unknown): TemplateMeta[] {
  const d = (json ?? {}) as { data?: unknown };
  if (!Array.isArray(d.data)) return [];
  const saida: TemplateMeta[] = [];
  for (const item of d.data) {
    const t = (item ?? {}) as { name?: unknown; language?: unknown; status?: unknown };
    if (typeof t.name !== "string" || !t.name) continue;
    saida.push({
      nome: t.name,
      idioma: typeof t.language === "string" ? t.language : "pt_BR",
      status: (typeof t.status === "string" && MAPA[t.status]) || "outro",
    });
  }
  return saida;
}

// Lista os templates da conta. O token precisa de permissão de GESTÃO
// (whatsapp_business_management) — se não tiver, a Meta responde erro e a tela cai para a
// digitação manual do nome. O status NÃO é copiado para o banco: seria uma segunda verdade
// envelhecendo em silêncio (a Meta pode reprovar um template a qualquer momento).
export async function listarTemplatesMeta(
  wabaId: string,
  token: string,
): Promise<{ templates: TemplateMeta[] } | { erro: string }> {
  const url =
    `https://graph.facebook.com/v21.0/${encodeURIComponent(wabaId)}/message_templates` +
    `?fields=name,language,status&limit=200`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    const corpo = await res.json().catch(() => null);
    if (!res.ok) return { erro: `Não foi possível listar os templates (HTTP ${res.status}).` };
    return { templates: parseTemplatesMeta(corpo) };
  } catch {
    return { erro: "Não foi possível falar com a Meta para listar os templates." };
  }
}
