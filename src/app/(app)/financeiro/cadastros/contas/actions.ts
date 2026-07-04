"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import type { EstadoCrud } from "@/components/financeiro/CadastroCrud";

const ROTA = "/financeiro/cadastros/contas";

async function exigirGestor() {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  return perfil;
}

export async function salvarConta(_prev: EstadoCrud, fd: FormData): Promise<EstadoCrud> {
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Sem permissão." };
  const nome = String(fd.get("nome") ?? "").trim();
  const tipo = String(fd.get("tipo") ?? "");
  if (!nome || !tipo) return { erro: "Nome e tipo são obrigatórios." };
  const id = String(fd.get("id") ?? "").trim();
  const registro = {
    nome,
    tipo,
    banco: String(fd.get("banco") ?? "").trim() || null,
    agencia: String(fd.get("agencia") ?? "").trim() || null,
    numero: String(fd.get("numero") ?? "").trim() || null,
    saldo_inicial: Number(fd.get("saldo_inicial") ?? 0) || 0,
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };
  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("conta_bancaria").update(registro).eq("id", id)
    : await supabase.from("conta_bancaria").insert({ ...registro, criado_por: perfil.id });
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function alternarAtivaConta(fd: FormData): Promise<void> {
  const perfil = await exigirGestor();
  if (!perfil) return;
  const id = String(fd.get("id") ?? "");
  const ativa = String(fd.get("ativa") ?? "") === "true";
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase
    .from("conta_bancaria")
    .update({ ativa, atualizado_em: new Date().toISOString(), atualizado_por: perfil.id })
    .eq("id", id);
  revalidatePath(ROTA);
}
