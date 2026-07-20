import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptadorAtivo } from "./ativo";
import { podeCancelarBoleto } from "./cancelamento";

type BoletoCancel = { id: string; provedor: string; provedor_boleto_id: string | null; status: string };

// Cancela o boleto no Inter (quando emitido + provedor inter) e marca status='cancelado'.
// Idempotente: não age em boleto já pago/cancelado. Lança se o cancelamento no Inter falhar.
export async function cancelarBoletoNoInter(
  admin: SupabaseClient,
  boleto: BoletoCancel,
  motivo: string,
): Promise<void> {
  if (!podeCancelarBoleto(boleto.status)) return;
  if (boleto.provedor === "inter" && boleto.provedor_boleto_id) {
    const ativo = await adaptadorAtivo();
    if (!("erro" in ativo) && typeof ativo.adaptador.cancelar === "function") {
      await ativo.adaptador.cancelar(boleto.provedor_boleto_id, motivo);
    }
  }
  await admin
    .from("boleto")
    .update({ status: "cancelado", atualizado_em: new Date().toISOString() })
    .eq("id", boleto.id);
}
