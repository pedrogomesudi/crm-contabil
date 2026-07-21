import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitir } from "@/lib/webhooks/emitir";

export type BaixaNucleoInput = {
  tituloId: string;
  dataRecebimento: string;
  valorRecebido: number;
  juros?: number;
  multa?: number;
  desconto?: number;
  contaBancariaId: string;
  formaPagamento: string;
};
export async function registrarBaixaNucleo(
  input: BaixaNucleoInput,
  ctx: { db: SupabaseClient; autorId: string | null },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (
    !input.tituloId ||
    !(input.valorRecebido > 0) ||
    !input.contaBancariaId ||
    !input.formaPagamento ||
    !input.dataRecebimento
  )
    return { ok: false, erro: "Preencha valor, data, conta e forma." };
  // O trigger recalcular_status_titulo atualiza titulo.status a partir das baixas.
  const { error } = await ctx.db.from("baixa").insert({
    titulo_id: input.tituloId,
    data_recebimento: input.dataRecebimento,
    valor_recebido: input.valorRecebido,
    juros: input.juros ?? 0,
    multa: input.multa ?? 0,
    desconto: input.desconto ?? 0,
    conta_bancaria_id: input.contaBancariaId,
    forma_pagamento: input.formaPagamento,
    criado_por: ctx.autorId,
  });
  if (error) return { ok: false, erro: "Falha ao registrar a baixa." };
  await emitir("titulo.pago", input.tituloId);
  return { ok: true };
}
