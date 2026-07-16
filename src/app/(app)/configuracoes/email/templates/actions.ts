"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarTemplatesEmail } from "@/lib/clientes/permissoes";
import { LIMITES } from "@/lib/email/validacao";

export type TemplateView = { id: string; nome: string; assunto: string; corpo: string; ativo: boolean };

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarTemplatesEmail(p.papel) ? p : null;
}

export async function listarTemplates(): Promise<TemplateView[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("email_template").select("id, nome, assunto, corpo, ativo").order("nome");
  return (data ?? []).map((t) => ({
    id: t.id as string,
    nome: t.nome as string,
    assunto: t.assunto as string,
    corpo: t.corpo as string,
    ativo: t.ativo as boolean,
  }));
}

export async function salvarTemplate(input: {
  id?: string;
  nome: string;
  assunto: string;
  corpo: string;
  ativo: boolean;
}): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const nome = input.nome.trim().slice(0, 120);
  const assunto = input.assunto.trim();
  const corpo = input.corpo.trim();
  if (!nome) return { erro: "Informe o nome do modelo." };
  if (!assunto) return { erro: "Informe o assunto." };
  if (!corpo) return { erro: "Escreva o corpo." };
  if (assunto.length > LIMITES.assunto) return { erro: "Assunto muito longo." };
  if (corpo.length > LIMITES.corpo) return { erro: "Corpo muito longo." };

  const supabase = await createServerSupabase();
  const dados = { nome, assunto, corpo, ativo: input.ativo, atualizado_em: new Date().toISOString() };
  const { error } = input.id
    ? await supabase.from("email_template").update(dados).eq("id", input.id)
    : await supabase.from("email_template").insert(dados);
  if (error) return { erro: "Falha ao salvar o modelo." };
  revalidatePath("/configuracoes/email/templates");
  return { ok: true };
}

export async function excluirTemplate(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("email_template").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath("/configuracoes/email/templates");
  return { ok: true };
}
