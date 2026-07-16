"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehCliente } from "@/lib/portal/permissoes";
import type { SolicitacaoCategoria } from "@/lib/solicitacoes/solicitacao";

const CATEGORIAS = new Set<SolicitacaoCategoria>(["guia", "documento", "duvida", "outro"]);

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !ehCliente(p.papel) || !p.clienteId) return null;
  return p;
}

// O cliente NÃO define status, prazo, responsável, tarefa nem autoria: o gatilho do banco
// (0088) sobrescreve tudo isso no servidor — nem enviando na requisição adianta.
export async function abrirSolicitacao(formData: FormData): Promise<{ id?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const categoria = String(formData.get("categoria") ?? "") as SolicitacaoCategoria;
  if (!CATEGORIAS.has(categoria)) return { erro: "Categoria inválida." };
  const assunto = String(formData.get("assunto") ?? "")
    .trim()
    .slice(0, 200);
  if (!assunto) return { erro: "Informe o assunto." };
  const mensagem = String(formData.get("mensagem") ?? "")
    .trim()
    .slice(0, 4000);
  if (!mensagem) return { erro: "Descreva a sua solicitação." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("solicitacao")
    .insert({ cliente_id: perfil.clienteId, categoria, assunto })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao abrir a solicitação." };

  const { error: errMsg } = await supabase
    .from("solicitacao_mensagem")
    .insert({ solicitacao_id: data.id, corpo: mensagem });
  if (errMsg) return { erro: "Solicitação aberta, mas a mensagem falhou." };

  revalidatePath("/portal/solicitacoes");
  return { id: data.id as string };
}

export async function responderSolicitacao(
  solicitacaoId: string,
  corpo: string,
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const texto = corpo.trim().slice(0, 4000);
  if (!texto) return { erro: "Escreva a mensagem." };
  const supabase = await createServerSupabase();
  // A RLS só deixa inserir em solicitação que é dele; o gatilho força a autoria.
  const { error } = await supabase.from("solicitacao_mensagem").insert({ solicitacao_id: solicitacaoId, corpo: texto });
  if (error) return { erro: "Falha ao enviar a mensagem." };
  revalidatePath(`/portal/solicitacoes/${solicitacaoId}`);
  return { ok: true };
}
