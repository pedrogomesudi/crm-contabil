import type { MsgConversa } from "@/lib/whatsapp/inbox";

// A linha crua que o Supabase Realtime entrega no evento (snake_case, como a tabela).
export type LinhaMensagemRaw = {
  id: string;
  telefone: string;
  texto: string;
  direcao: "IN" | "OUT";
  lida: boolean;
  criado_em: string;
  status?: string | null;
  midia_tipo?: string | null;
  midia_path?: string | null;
  midia_nome?: string | null;
  midia_mime?: string | null;
};

// Converte a linha crua na MsgConversa da UI. Mesmo mapa de abrirConversa, SEM o join de cliente —
// o Realtime entrega só a linha da tabela, não o razao_social casado. O nome vem no refetch da lista.
export function linhaParaMsg(raw: LinhaMensagemRaw): MsgConversa {
  return {
    id: raw.id,
    telefone: raw.telefone,
    texto: raw.texto,
    direcao: raw.direcao,
    lida: raw.lida,
    criado_em: raw.criado_em,
    status: raw.status ?? "",
    midiaTipo: raw.midia_tipo ?? null,
    midiaPath: raw.midia_path ?? null,
    midiaNome: raw.midia_nome ?? null,
    midiaMime: raw.midia_mime ?? null,
    cliente: null,
  };
}

// Decide o que fazer com um evento de INSERT. O telefone já é chave canônica nos dois lados (o webhook
// grava com chaveDeNumeroCompleto, e o `ativa` do Inbox é esse mesmo telefone), então a comparação é
// direta, sem re-canonicalizar.
export function rotearEvento(
  raw: LinhaMensagemRaw,
  telefoneAtivo: string | null,
  idsNaThread: Set<string>,
): { paraThread: boolean; listaMudou: boolean } {
  const daConversaAberta = telefoneAtivo !== null && raw.telefone === telefoneAtivo;
  const paraThread = daConversaAberta && !idsNaThread.has(raw.id);
  return { paraThread, listaMudou: true };
}
