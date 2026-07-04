"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { consultarCnpj } from "@/lib/receita/brasilapi";

export type ClienteReceita = { cpf_cnpj: string; razao_social: string };
export type ResultadoReceita = { ok?: boolean; razao?: string | null; situacao?: string | null; erro?: string };

// Cadastral (razão social/endereço) => mesmo gate da importação: admin/assistente.
async function autorizado(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return !!perfil && (perfil.papel === "admin" || perfil.papel === "assistente");
}

// Lista os clientes com CNPJ (14 dígitos) — PF/CPF ficam de fora (sem consulta pública).
export async function listarClientesReceita(): Promise<ClienteReceita[]> {
  if (!(await autorizado())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("clientes")
    .select("cpf_cnpj, razao_social")
    .is("excluido_em", null)
    .order("razao_social");
  return (data ?? []).filter((c) => String(c.cpf_cnpj ?? "").replace(/\D/g, "").length === 14);
}

// Consulta um CNPJ na Receita (BrasilAPI) e atualiza razão social + endereço do
// cliente. Grava via service_role; o navegador orquestra o laço um a um.
export async function atualizarViaReceita(cpfCnpj: string): Promise<ResultadoReceita> {
  if (!(await autorizado())) return { erro: "Sem permissão (apenas admin/assistente)." };
  const doc = String(cpfCnpj ?? "").replace(/\D/g, "");
  if (doc.length !== 14) return { erro: "Não é um CNPJ." };

  const r = await consultarCnpj(doc);
  if (r.erro || !r.dados) return { erro: r.erro ?? "Sem dados." };

  const patch: { razao_social?: string; endereco?: Record<string, string> } = {};
  if (r.dados.razaoSocial) patch.razao_social = r.dados.razaoSocial;
  if (Object.keys(r.dados.endereco).length) patch.endereco = r.dados.endereco;
  if (Object.keys(patch).length === 0) return { erro: "Receita não retornou razão social nem endereço." };

  const admin = createAdminSupabase();
  const { error } = await admin.from("clientes").update(patch).eq("cpf_cnpj", doc);
  if (error) return { erro: "Falha ao gravar os dados." };
  revalidatePath("/clientes");
  return { ok: true, razao: r.dados.razaoSocial, situacao: r.dados.situacao };
}
