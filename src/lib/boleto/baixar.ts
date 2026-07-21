import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dadosBaixaBoleto } from "./baixa";
import type { EventoPagamento } from "./tipos";
import { emitir } from "@/lib/webhooks/emitir";

type BoletoBaixa = { id: string; titulo_id: string; valor: number; status: string };

// Cria a baixa de um boleto pago e marca o boleto como pago. Idempotente: não age
// se já está pago/cancelado ou se não há conta de destino. Usado pelo webhook e pela sync.
export async function baixarBoletoPago(
  admin: SupabaseClient,
  boleto: BoletoBaixa,
  evento: EventoPagamento,
  contaBancariaId: string | null,
  hoje: string,
): Promise<boolean> {
  if (boleto.status === "pago" || boleto.status === "cancelado") return false;
  if (!contaBancariaId) return false;
  const d = dadosBaixaBoleto(evento, Number(boleto.valor), hoje);
  const { error } = await admin.from("baixa").insert({
    titulo_id: boleto.titulo_id,
    data_recebimento: d.dataRecebimento,
    valor_recebido: d.valorRecebido,
    conta_bancaria_id: contaBancariaId,
    forma_pagamento: "BOLETO",
  });
  if (error) return false;
  await admin.from("boleto").update({ status: "pago", atualizado_em: new Date().toISOString() }).eq("id", boleto.id);
  await emitir("titulo.pago", boleto.titulo_id);
  return true;
}
