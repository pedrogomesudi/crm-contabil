"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { validarCNPJ, validarCPF } from "@/lib/validation/documento";
import type { EstadoCrud } from "@/components/financeiro/CadastroCrud";

const ROTA = "/financeiro/cadastros/fornecedores";

async function exigirGestor() {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  return perfil;
}

export async function salvarFornecedor(_prev: EstadoCrud, fd: FormData): Promise<EstadoCrud> {
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Sem permissão." };
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) return { erro: "Nome é obrigatório." };
  const doc = String(fd.get("cnpj_cpf") ?? "").replace(/\D/g, "");
  if (doc && !(validarCNPJ(doc) || validarCPF(doc))) {
    return { erro: "CNPJ/CPF inválido." };
  }
  const id = String(fd.get("id") ?? "").trim();
  const registro = {
    nome,
    cnpj_cpf: doc || null,
    contato: {
      telefone: String(fd.get("telefone") ?? "").trim() || undefined,
      email: String(fd.get("email") ?? "").trim() || undefined,
    },
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };
  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("fornecedor").update(registro).eq("id", id)
    : await supabase.from("fornecedor").insert({ ...registro, criado_por: perfil.id });
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function alternarAtivaFornecedor(fd: FormData): Promise<void> {
  const perfil = await exigirGestor();
  if (!perfil) return;
  const id = String(fd.get("id") ?? "");
  const ativa = String(fd.get("ativa") ?? "") === "true";
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase
    .from("fornecedor")
    .update({ ativa, atualizado_em: new Date().toISOString(), atualizado_por: perfil.id })
    .eq("id", id);
  revalidatePath(ROTA);
}
