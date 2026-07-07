export type MsgConversa = {
  telefone: string;
  texto: string;
  direcao: "IN" | "OUT";
  lida: boolean;
  criado_em: string;
  cliente?: string | null;
  status: string;
};
export type Conversa = {
  telefone: string;
  cliente: string | null;
  ultima: string;
  ultima_em: string;
  nao_lidas: number;
  favorita: boolean;
};

export type FiltroAba = "todas" | "nao_lidas" | "favoritos";

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

export type StatusEntrega = "ENVIADO" | "ENTREGUE" | "LIDO";

// Extrai um evento de status do payload do Z-API. null se não for evento de status reconhecível.
export function extrairStatusZapi(payload: unknown): { status: StatusEntrega; ids: string[] } | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const bruto = typeof p.status === "string" ? p.status.toUpperCase() : "";
  if (!bruto) return null;
  const mapa: Record<string, StatusEntrega> = {
    SENT: "ENVIADO",
    RECEIVED: "ENTREGUE",
    DELIVERED: "ENTREGUE",
    DELIVERY_ACK: "ENTREGUE",
    READ: "LIDO",
    PLAYED: "LIDO",
    READ_SELF: "LIDO",
  };
  const status = mapa[bruto];
  if (!status) return null;
  const ids: string[] = [];
  if (Array.isArray(p.ids)) for (const x of p.ids) if (typeof x === "string" && x) ids.push(x);
  if (typeof p.messageId === "string" && p.messageId) ids.push(p.messageId);
  if (typeof p.id === "string" && p.id) ids.push(p.id);
  const unicos = [...new Set(ids)];
  return unicos.length ? { status, ids: unicos } : null;
}

export type MarcaEntrega = "enviado" | "entregue" | "lido" | "erro";

// Ícone de entrega para a UI. Só para OUT; null para IN/sem status.
export function marcaEntrega(status: string, direcao: "IN" | "OUT"): MarcaEntrega | null {
  if (direcao !== "OUT") return null;
  switch (status) {
    case "ERRO":
      return "erro";
    case "LIDO":
      return "lido";
    case "ENTREGUE":
      return "entregue";
    case "ENVIADO":
      return "enviado";
    default:
      return null;
  }
}

// Agrupa mensagens por telefone → conversas, mais recente primeiro. `favoritos` marca a estrela.
export function agruparConversas(msgs: MsgConversa[], favoritos: Set<string> = new Set()): Conversa[] {
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
      favorita: favoritos.has(telefone),
    });
  }
  return convs.sort((a, b) => b.ultima_em.localeCompare(a.ultima_em));
}

// "HH:MM" 24h da data local.
export function horaMsg(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// "hoje" / "ontem" / "dd/mm/aaaa" comparando as datas locais.
export function separadorDia(iso: string, hojeIso: string): string {
  const ymd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const d = new Date(iso);
  const hoje = new Date(hojeIso);
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (ymd(d) === ymd(hoje)) return "hoje";
  if (ymd(d) === ymd(ontem)) return "ontem";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Filtra por aba + busca (nome do cliente OU telefone), mantendo a ordem de agruparConversas.
export function filtrarConversas(convs: Conversa[], aba: FiltroAba, busca: string): Conversa[] {
  const termo = busca.trim().toLowerCase();
  return convs.filter((c) => {
    if (aba === "nao_lidas" && c.nao_lidas === 0) return false;
    if (aba === "favoritos" && !c.favorita) return false;
    if (termo) {
      const alvo = `${(c.cliente ?? "").toLowerCase()} ${c.telefone}`;
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

// Contadores para os badges das abas (por CONVERSA, não por mensagem).
export function contadores(convs: Conversa[]): { todas: number; nao_lidas: number; favoritos: number } {
  return {
    todas: convs.length,
    nao_lidas: convs.filter((c) => c.nao_lidas > 0).length,
    favoritos: convs.filter((c) => c.favorita).length,
  };
}
