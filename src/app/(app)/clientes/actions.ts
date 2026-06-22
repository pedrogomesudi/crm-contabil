"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { clienteSchema } from "@/lib/validation/cliente";
import type { EstadoCliente, EstadoHonorario } from "./estados";

// '' (uuid/date opcionais) -> null, senão o Postgres rejeita com 22P02.
function limparOpcionais<T extends Record<string, unknown>>(d: T): T {
  const out: Record<string, unknown> = { ...d };
  for (const k of ["contador_id", "data_inicio", "email"]) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out as T;
}

// Monta o endereco (jsonb) a partir dos campos planos do form.
function montarEndereco(formData: FormData): Record<string, string> | null {
  const campos = ["logradouro", "numero", "bairro", "cidade", "uf", "cep"];
  const e: Record<string, string> = {};
  let temAlgum = false;
  for (const c of campos) {
    const v = String(formData.get(c) ?? "").trim();
    if (v) {
      e[c] = v;
      temAlgum = true;
    }
  }
  return temAlgum ? e : null;
}

function lerEValidar(formData: FormData) {
  const dados = Object.fromEntries(formData) as Record<string, string>;
  // normaliza CPF/CNPJ para só dígitos (unicidade no banco)
  if (dados.cpf_cnpj) dados.cpf_cnpj = dados.cpf_cnpj.replace(/\D/g, "");
  return clienteSchema.safeParse(dados);
}

export async function criarCliente(
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
  const parsed = lerEValidar(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createServerSupabase();
  // criado_por e contador_id (p/ contador) são forçados pelo trigger no banco.
  const { error } = await supabase.from("clientes").insert({
    ...limparOpcionais(parsed.data),
    endereco: montarEndereco(formData),
  });
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
    return { erro: "Não foi possível salvar o cliente (sem permissão?)." };
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
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("clientes")
    .update({ ...limparOpcionais(parsed.data), endereco: montarEndereco(formData) })
    .eq("id", clienteId);
  if (error) {
    if (error.code === "23505") return { erro: "CPF/CNPJ já cadastrado em outro cliente." };
    return { erro: "Não foi possível atualizar o cliente." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  redirect("/clientes");
}

export async function salvarHonorario(
  clienteId: string,
  _prev: EstadoHonorario,
  formData: FormData,
): Promise<EstadoHonorario> {
  const bruto = String(formData.get("honorario_mensal") ?? "")
    .replace(",", ".")
    .trim();
  const valor = bruto === "" ? null : Number(bruto);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    return { erro: "Honorário inválido." };
  }
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("clientes_financeiro")
    .upsert(
      { cliente_id: clienteId, honorario_mensal: valor, atualizado_por: user?.id },
      { onConflict: "cliente_id" },
    );
  if (error) return { erro: "Sem permissão para alterar honorário." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
