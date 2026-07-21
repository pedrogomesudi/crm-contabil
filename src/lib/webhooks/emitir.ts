import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { endpointsParaEvento } from "./sinal";
import {
  serializarCliente,
  serializarTitulo,
  serializarObrigacao,
  serializarDocumento,
  COLS_CLIENTE,
  COLS_TITULO,
  COLS_OBRIGACAO,
  COLS_DOCUMENTO,
} from "@/lib/api/serializar";

type Fonte = { tabela: string; cols: string; serializar: (r: Record<string, unknown>) => unknown };
const FONTE: Record<string, Fonte> = {
  cliente: { tabela: "clientes", cols: COLS_CLIENTE, serializar: serializarCliente },
  titulo: { tabela: "titulo", cols: COLS_TITULO, serializar: serializarTitulo },
  obrigacao: { tabela: "obrigacao_instancia", cols: COLS_OBRIGACAO, serializar: serializarObrigacao },
  documento: { tabela: "documentos", cols: COLS_DOCUMENTO, serializar: serializarDocumento },
};

// Enfileira o evento para cada endpoint ativo que o assina. Best-effort: qualquer falha aqui
// só afeta o webhook, nunca a operação principal. Barato quando não há endpoints.
export async function emitir(evento: string, id: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { data: eps } = await admin.from("webhook_endpoint").select("id, eventos, ativo");
    const alvos = endpointsParaEvento((eps ?? []) as { id: string; eventos: string[]; ativo: boolean }[], evento);
    if (alvos.length === 0) return; // nada a fazer — não re-seleciona o recurso

    const fonte = FONTE[evento.split(".")[0] ?? ""];
    if (!fonte) return;
    const { data: row } = await admin.from(fonte.tabela).select(fonte.cols).eq("id", id).maybeSingle();
    if (!row) return;
    const payload = { evento, dados: fonte.serializar(row as unknown as Record<string, unknown>) };

    await admin.from("webhook_entrega").insert(alvos.map((e) => ({ endpoint_id: e.id, evento, payload })));
  } catch (e) {
    console.error("emitir webhook:", e instanceof Error ? e.message : e);
  }
}
