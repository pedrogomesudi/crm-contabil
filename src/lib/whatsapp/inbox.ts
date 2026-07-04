export type MsgConversa = {
  telefone: string;
  texto: string;
  direcao: "IN" | "OUT";
  lida: boolean;
  criado_em: string;
  cliente?: string | null;
};
export type Conversa = { telefone: string; cliente: string | null; ultima: string; ultima_em: string; nao_lidas: number };

const CHAVES_MIDIA = ["image", "audio", "video", "document", "sticker", "contact", "location"];

// Extrai uma mensagem RECEBIDA do payload do Z-API. null para eventos que não são mensagem recebida.
export function extrairMensagemZapi(payload: unknown): { telefone: string; texto: string; zId: string } | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (p.fromMe === true) return null; // eco das nossas próprias saídas
  const telefone = typeof p.phone === "string" ? p.phone : "";
  const zId = typeof p.messageId === "string" ? p.messageId : "";
  if (!telefone || !zId) return null;
  const textoDireto =
    (p.text as { message?: string } | undefined)?.message ??
    (typeof p.message === "string" ? p.message : undefined);
  if (typeof textoDireto === "string" && textoDireto.length > 0) {
    return { telefone, texto: textoDireto, zId };
  }
  const temMidia = CHAVES_MIDIA.some((k) => p[k] != null);
  if (temMidia) return { telefone, texto: "[mídia não suportada]", zId };
  return null; // status/ack/sem conteúdo
}

// Agrupa mensagens por telefone → conversas, ordenadas da mais recente para a mais antiga.
export function agruparConversas(msgs: MsgConversa[]): Conversa[] {
  const porTel = new Map<string, MsgConversa[]>();
  for (const m of msgs) {
    const arr = porTel.get(m.telefone) ?? [];
    arr.push(m);
    porTel.set(m.telefone, arr);
  }
  const convs: Conversa[] = [];
  for (const [telefone, arr] of porTel) {
    const ordenadas = [...arr].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const ultima = ordenadas[ordenadas.length - 1]!;
    const cliente = ordenadas.find((m) => m.cliente)?.cliente ?? null;
    convs.push({
      telefone,
      cliente,
      ultima: ultima.texto,
      ultima_em: ultima.criado_em,
      nao_lidas: arr.filter((m) => m.direcao === "IN" && !m.lida).length,
    });
  }
  return convs.sort((a, b) => b.ultima_em.localeCompare(a.ultima_em));
}
