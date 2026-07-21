import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarCobrancaAvulsa, competenciaDoVencimento } from "@/lib/financeiro/cobranca-avulsa";
import { emitir } from "@/lib/webhooks/emitir";

export type TituloAvulsoNucleoInput = {
  clienteId: string;
  valor: number;
  vencimento: string;
  categoriaId: string;
  descricao: string;
};
export async function criarTituloAvulsoNucleo(
  input: TituloAvulsoNucleoInput,
  ctx: { db: SupabaseClient; autorId: string | null },
): Promise<{ ok: true; tituloId: string } | { ok: false; codigo: "validacao" | "duplicado" | "erro"; erro: string }> {
  const v = validarCobrancaAvulsa(input);
  if (!v.ok) return { ok: false, codigo: "validacao", erro: v.erro };
  const { data, error } = await ctx.db
    .from("titulo")
    .insert({
      tipo: "RECEBER",
      origem: "RECEITA_AVULSA",
      status: "ABERTO",
      cliente_id: input.clienteId,
      valor: input.valor,
      vencimento: input.vencimento,
      competencia: competenciaDoVencimento(input.vencimento),
      categoria_id: input.categoriaId,
      descricao: input.descricao.trim() || null,
      criado_por: ctx.autorId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505")
      return { ok: false, codigo: "duplicado", erro: "Já existe cobrança desse tipo nesta competência." };
    return { ok: false, codigo: "erro", erro: "Falha ao criar a cobrança." };
  }
  const tituloId = data.id as string;
  await emitir("titulo.criado", tituloId);
  return { ok: true, tituloId };
}
