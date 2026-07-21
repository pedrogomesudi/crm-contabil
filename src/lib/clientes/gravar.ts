import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClienteInput } from "@/lib/validation/cliente";
import { ehContadorValido } from "@/lib/clientes/contadores";

export type CtxEscrita = { db: SupabaseClient; autorId: string | null };
export type ClienteEscrita = {
  dados: ClienteInput;
  endereco: Record<string, string> | null;
  representante: Record<string, string> | null;
  camposCustom: Record<string, unknown>;
};
type Dup = { id: string; status: string | null; razao_social: string | null };
export type ResultadoCriar =
  | { ok: true; id: string }
  | { ok: false; codigo: "contador_invalido" | "duplicado" | "erro"; erro: string; duplicado?: Dup };
export type ResultadoAtualizar =
  | { ok: true }
  | { ok: false; codigo: "contador_invalido" | "conflito" | "duplicado" | "erro"; erro: string };

const limparVazios = (d: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) out[k] = v === "" || v === undefined ? null : v;
  return out;
};

export async function criarClienteNucleo(input: ClienteEscrita, ctx: CtxEscrita): Promise<ResultadoCriar> {
  if (input.dados.contador_id && !(await ehContadorValido(input.dados.contador_id))) {
    return { ok: false, codigo: "contador_invalido", erro: "Contador selecionado é inválido." };
  }
  const payload = limparVazios({ ...input.dados });
  delete payload.status; // DB default 'ativo'
  const { data, error } = await ctx.db
    .from("clientes")
    .insert({
      ...payload,
      endereco: input.endereco,
      representante: input.representante,
      campos_custom: input.camposCustom,
    })
    .select("id, status, razao_social");
  if (error) {
    if (error.code === "23505") {
      const { data: ex } = await ctx.db
        .from("clientes")
        .select("id, status, razao_social")
        .eq("cpf_cnpj", input.dados.cpf_cnpj)
        .maybeSingle();
      return {
        ok: false,
        codigo: "duplicado",
        erro: "CPF/CNPJ já cadastrado.",
        duplicado: ex
          ? {
              id: ex.id as string,
              status: (ex.status as string) ?? null,
              razao_social: (ex.razao_social as string) ?? null,
            }
          : undefined,
      };
    }
    return { ok: false, codigo: "erro", erro: "Não foi possível salvar o cliente." };
  }
  if (!data || data.length === 0) return { ok: false, codigo: "erro", erro: "Não foi possível salvar o cliente." };
  return { ok: true, id: data[0]!.id as string };
}

export async function atualizarClienteNucleo(
  clienteId: string,
  input: ClienteEscrita & { atualizadoEmEsperado: string },
  ctx: CtxEscrita,
): Promise<ResultadoAtualizar> {
  if (!input.atualizadoEmEsperado) return { ok: false, codigo: "conflito", erro: "Recarregue e tente novamente." };
  if (input.dados.contador_id && !(await ehContadorValido(input.dados.contador_id))) {
    return { ok: false, codigo: "contador_invalido", erro: "Contador selecionado é inválido." };
  }
  const { data, error } = await ctx.db
    .from("clientes")
    .update({
      ...limparVazios({ ...input.dados }),
      endereco: input.endereco,
      representante: input.representante,
      campos_custom: input.camposCustom,
    })
    .eq("id", clienteId)
    .eq("atualizado_em", input.atualizadoEmEsperado)
    .select("id");
  if (error) {
    if (error.code === "23505")
      return { ok: false, codigo: "duplicado", erro: "CPF/CNPJ já cadastrado em outro cliente." };
    return { ok: false, codigo: "erro", erro: "Não foi possível atualizar o cliente." };
  }
  if (!data || data.length === 0)
    return { ok: false, codigo: "conflito", erro: "Sem permissão ou alterado por outra pessoa. Recarregue." };
  return { ok: true };
}
