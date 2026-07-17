import { chaveTelefone, chaveDeNumeroCompleto } from "@/lib/whatsapp/mensagem";

export type MsgConversa = {
  id: string;
  telefone: string;
  texto: string;
  direcao: "IN" | "OUT";
  lida: boolean;
  criado_em: string;
  cliente?: string | null;
  status: string;
  midiaTipo: string | null;
  midiaPath: string | null;
  midiaNome: string | null;
  midiaMime: string | null;
};
export type StatusConversa = "aberta" | "pendente" | "finalizada";

export type Conversa = {
  telefone: string;
  cliente: string | null;
  contato: string | null;
  ultima: string;
  ultima_em: string;
  nao_lidas: number;
  favorita: boolean;
  status: StatusConversa;
  atendenteId: string | null;
  atendenteNome: string | null;
};

export type ConversaMeta = {
  favorita?: boolean;
  status?: StatusConversa;
  atendenteId?: string | null;
  atendenteNome?: string | null;
  cliente?: string | null;
  contato?: string | null;
};

export type FiltroAba = "abertas" | "pendentes" | "finalizadas" | "favoritos";

const CHAVES_MIDIA = ["image", "audio", "video", "document", "sticker", "contact", "location"];

export type MidiaRecebida = {
  tipo: "image" | "audio" | "document";
  url: string;
  mime: string;
  nome: string | null;
  caption: string;
};

// Extrai uma mensagem RECEBIDA do payload do Z-API. `midia` != null para image/audio/document.
export function extrairMensagemZapi(
  payload: unknown,
): { telefone: string; texto: string; zId: string; midia: MidiaRecebida | null } | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (p.fromMe === true) return null; // eco das nossas próprias saídas
  const telefone = typeof p.phone === "string" ? p.phone : "";
  const zId = typeof p.messageId === "string" ? p.messageId : "";
  if (!telefone || !zId) return null;
  const textoDireto =
    (p.text as { message?: string } | undefined)?.message ?? (typeof p.message === "string" ? p.message : undefined);
  if (typeof textoDireto === "string" && textoDireto.length > 0) {
    return { telefone, texto: textoDireto, zId, midia: null };
  }
  const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const img = p.image as Record<string, unknown> | undefined;
  if (img) {
    const url = str(img.imageUrl) ?? str(img.url);
    const caption = str(img.caption) ?? "";
    if (url)
      return {
        telefone,
        zId,
        texto: caption,
        midia: { tipo: "image", url, mime: str(img.mimeType) ?? "image/jpeg", nome: null, caption },
      };
  }
  const aud = p.audio as Record<string, unknown> | undefined;
  if (aud) {
    const url = str(aud.audioUrl) ?? str(aud.url);
    if (url)
      return {
        telefone,
        zId,
        texto: "",
        midia: { tipo: "audio", url, mime: str(aud.mimeType) ?? "audio/ogg", nome: null, caption: "" },
      };
  }
  const doc = p.document as Record<string, unknown> | undefined;
  if (doc) {
    const url = str(doc.documentUrl) ?? str(doc.url);
    const caption = str(doc.caption) ?? "";
    if (url)
      return {
        telefone,
        zId,
        texto: caption,
        midia: {
          tipo: "document",
          url,
          mime: str(doc.mimeType) ?? "application/octet-stream",
          nome: str(doc.fileName) ?? str(doc.title) ?? "arquivo",
          caption,
        },
      };
  }
  const temMidia = CHAVES_MIDIA.some((k) => p[k] != null);
  if (temMidia) return { telefone, texto: "[mídia não suportada]", zId, midia: null };
  return null; // status/ack/sem conteúdo
}

// "image/png" → "png"; "image/jpeg" → "jpg"; "application/pdf" → "pdf"; "audio/ogg; codecs=opus" → "ogg".
export function extensaoPorMime(mime: string): string {
  const sub = (mime || "").split("/")[1]?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!sub) return "bin";
  if (sub === "jpeg") return "jpg";
  if (sub === "svg+xml") return "svg";
  const san = sub.replace(/[^a-z0-9]/g, "");
  return san || "bin";
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

// Agrupa mensagens por telefone → conversas, mais recente primeiro. `meta` sobrepõe por telefone.
export function agruparConversas(msgs: MsgConversa[], meta: Map<string, ConversaMeta> = new Map()): Conversa[] {
  const porTel = new Map<string, MsgConversa[]>();
  for (const m of msgs) {
    const chave = chaveDeNumeroCompleto(m.telefone) ?? m.telefone; // mensagens vêm do webhook, já com DDI
    const arr = porTel.get(chave) ?? [];
    arr.push(m);
    porTel.set(chave, arr);
  }
  const convs: Conversa[] = [];
  for (const [telefone, arr] of porTel) {
    const ordenadas = [...arr].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const ultima = ordenadas[ordenadas.length - 1]!;
    const cliente = ordenadas.find((m) => m.cliente)?.cliente ?? null;
    const md = meta.get(telefone);
    convs.push({
      telefone,
      cliente: md?.cliente ?? cliente,
      contato: md?.contato ?? null,
      ultima: ultima.texto,
      ultima_em: ultima.criado_em,
      nao_lidas: arr.filter((m) => m.direcao === "IN" && !m.lida).length,
      favorita: md?.favorita ?? false,
      status: md?.status ?? "aberta",
      atendenteId: md?.atendenteId ?? null,
      atendenteNome: md?.atendenteNome ?? null,
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

// Filtra por aba (status/favoritos) + busca (nome do cliente OU telefone), mantendo a ordem.
export function filtrarConversas(convs: Conversa[], aba: FiltroAba, busca: string): Conversa[] {
  const termo = busca.trim().toLowerCase();
  return convs.filter((c) => {
    if (aba === "favoritos") {
      if (!c.favorita) return false;
    } else if (c.status !== aba.slice(0, -1)) {
      // "abertas"→"aberta", "pendentes"→"pendente", "finalizadas"→"finalizada"
      return false;
    }
    if (termo) {
      const alvo = `${(c.cliente ?? "").toLowerCase()} ${c.telefone}`;
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

// Contadores para as abas.
export function contadores(convs: Conversa[]): {
  abertas: number;
  pendentes: number;
  finalizadas: number;
  favoritos: number;
} {
  return {
    abertas: convs.filter((c) => c.status === "aberta").length,
    pendentes: convs.filter((c) => c.status === "pendente").length,
    finalizadas: convs.filter((c) => c.status === "finalizada").length,
    favoritos: convs.filter((c) => c.favorita).length,
  };
}

// Mapa telefone-normalizado → { razaoSocial, contato }. Só telefones com UM único cliente.
export function mapaClientesPorTelefone(
  clientes: {
    razao_social: string;
    responsavel_nome: string | null;
    telefone: string | null;
    telefone_ddi?: string | null;
  }[],
): Map<string, { razaoSocial: string; contato: string | null }> {
  const contagem = new Map<string, number>();
  const mapa = new Map<string, { razaoSocial: string; contato: string | null }>();
  for (const c of clientes) {
    const tel = chaveTelefone(c.telefone ?? "", c.telefone_ddi ?? "55");
    if (!tel) continue;
    contagem.set(tel, (contagem.get(tel) ?? 0) + 1);
    mapa.set(tel, { razaoSocial: c.razao_social, contato: c.responsavel_nome ?? null });
  }
  for (const [tel, n] of contagem) if (n > 1) mapa.delete(tel);
  return mapa;
}
