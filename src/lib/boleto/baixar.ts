import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dadosBaixaBoleto } from "./baixa";
import type { EventoPagamento } from "./tipos";
import { emitir } from "@/lib/webhooks/emitir";

type BoletoBaixa = {
  id: string;
  titulo_id: string | null;
  valor: number;
  status: string;
  grupo_cobranca_id?: string | null;
};

// Decide as baixas (título + valor) a criar quando um boleto é pago. Boleto de grupo baixa cada
// título ligado pelo seu valor; boleto individual baixa o seu único título pelo valor recebido.
export function linhasBaixaBoleto(
  boleto: { titulo_id: string | null; grupo_cobranca_id?: string | null },
  ligacoes: { titulo_id: string; valor: number }[],
  valorRecebidoIndividual: number,
): { tituloId: string; valor: number }[] {
  if (boleto.grupo_cobranca_id) return ligacoes.map((l) => ({ tituloId: l.titulo_id, valor: Number(l.valor) }));
  return boleto.titulo_id ? [{ tituloId: boleto.titulo_id, valor: valorRecebidoIndividual }] : [];
}

// Cria a(s) baixa(s) de um boleto pago e marca o boleto como pago. Idempotente: não age se já
// está pago/cancelado ou se não há conta de destino. Boleto de grupo baixa todos os títulos.
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

  let ligacoes: { titulo_id: string; valor: number }[] = [];
  if (boleto.grupo_cobranca_id) {
    const { data } = await admin.from("boleto_titulo").select("titulo_id, valor").eq("boleto_id", boleto.id);
    ligacoes = (data ?? []) as { titulo_id: string; valor: number }[];
  }
  const linhas = linhasBaixaBoleto(boleto, ligacoes, d.valorRecebido);
  if (linhas.length === 0) return false;

  const { error } = await admin.from("baixa").insert(
    linhas.map((l) => ({
      titulo_id: l.tituloId,
      data_recebimento: d.dataRecebimento,
      valor_recebido: l.valor,
      conta_bancaria_id: contaBancariaId,
      forma_pagamento: "BOLETO",
    })),
  );
  if (error) return false;
  await admin.from("boleto").update({ status: "pago", atualizado_em: new Date().toISOString() }).eq("id", boleto.id);
  for (const l of linhas) await emitir("titulo.pago", l.tituloId);
  return true;
}
