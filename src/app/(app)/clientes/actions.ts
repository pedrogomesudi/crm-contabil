"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { clienteSchema } from "@/lib/validation/cliente";
import { parseValorBR } from "@/lib/format";
import type { EstadoCliente, EstadoHonorario } from "./estados";

// '' (uuid/date opcionais) -> null, senão o Postgres rejeita com 22P02.
function limparOpcionais(d: Record<string, unknown>): Record<string, unknown> {
  const out = { ...d };
  for (const k of ["contador_id", "data_inicio", "email"]) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out;
}

// Monta o endereco (jsonb) a partir dos campos planos do form (normalizado).
function montarEndereco(formData: FormData): Record<string, string> | null {
  const campos = ["logradouro", "numero", "bairro", "cidade", "uf", "cep"];
  const e: Record<string, string> = {};
  let temAlgum = false;
  for (const c of campos) {
    let v = String(formData.get(c) ?? "")
      .trim()
      .slice(0, 120);
    if (c === "uf") v = v.toUpperCase().slice(0, 2);
    if (v) {
      e[c] = v;
      temAlgum = true;
    }
  }
  return temAlgum ? e : null;
}

function lerEValidar(formData: FormData) {
  const dados = Object.fromEntries(formData) as Record<string, string>;
  if (dados.cpf_cnpj) dados.cpf_cnpj = dados.cpf_cnpj.replace(/\D/g, ""); // só dígitos (unicidade)
  if (dados.email) dados.email = dados.email.trim();
  return clienteSchema.safeParse(dados);
}

function mensagensErro(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join(" • ");
}

export async function criarCliente(
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
  const parsed = lerEValidar(formData);
  if (!parsed.success) return { erro: mensagensErro(parsed.error.issues) };

  const supabase = await createServerSupabase();
  // criado_por e contador_id (p/ contador) são forçados pelo trigger no banco.
  const { data, error } = await supabase
    .from("clientes")
    .insert({ ...limparOpcionais(parsed.data), endereco: montarEndereco(formData) })
    .select("id");
  if (error) {
    if (error.code === "23505") {
      const { data: existente } = await supabase
        .from("clientes")
        .select("id, status")
        .eq("cpf_cnpj", parsed.data.cpf_cnpj)
        .maybeSingle();
      if (existente?.status === "inativo") {
        return { erro: "CPF/CNPJ já cadastrado em um cliente INATIVO.", reativarId: existente.id };
      }
      if (existente?.status === "ativo") {
        return { erro: "CPF/CNPJ já cadastrado em um cliente ativo." };
      }
      return { erro: "CPF/CNPJ já cadastrado. Procure um administrador." };
    }
    console.error("criarCliente:", error.code, error.message);
    return { erro: "Não foi possível salvar o cliente (sem permissão?)." };
  }
  if (!data || data.length === 0) {
    return { erro: "Não foi possível salvar o cliente (sem permissão)." };
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function atualizarCliente(
  clienteId: string,
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
  const parsed = lerEValidar(formData);
  if (!parsed.success) return { erro: mensagensErro(parsed.error.issues) };

  const supabase = await createServerSupabase();
  const original = String(formData.get("atualizado_em") ?? "");
  let upd = supabase
    .from("clientes")
    .update({ ...limparOpcionais(parsed.data), endereco: montarEndereco(formData) })
    .eq("id", clienteId);
  if (original) upd = upd.eq("atualizado_em", original); // concorrência otimista
  const { data, error } = await upd.select("id");
  if (error) {
    if (error.code === "23505") return { erro: "CPF/CNPJ já cadastrado em outro cliente." };
    console.error("atualizarCliente:", error.code, error.message);
    return { erro: "Não foi possível atualizar o cliente." };
  }
  if (!data || data.length === 0) {
    return {
      erro: "Não foi salvo: sem permissão ou o cliente foi alterado por outra pessoa. Recarregue a página.",
    };
  }
  revalidatePath(`/clientes/${clienteId}`);
  redirect("/clientes?ok=1");
}

export async function salvarHonorario(
  clienteId: string,
  _prev: EstadoHonorario,
  formData: FormData,
): Promise<EstadoHonorario> {
  const valor = parseValorBR(String(formData.get("honorario_mensal") ?? ""));
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    return { erro: "Honorário inválido." };
  }
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre novamente." };

  const { data, error } = await supabase
    .from("clientes_financeiro")
    .upsert(
      {
        cliente_id: clienteId,
        honorario_mensal: valor,
        atualizado_por: user.id,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "cliente_id" },
    )
    .select("cliente_id");
  if (error || !data || data.length === 0) {
    return { erro: "Sem permissão para alterar honorário." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
