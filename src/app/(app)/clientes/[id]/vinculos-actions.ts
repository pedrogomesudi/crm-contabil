"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { validarNovaMatriz } from "@/lib/clientes/vinculos";

const rev = (id: string) => revalidatePath(`/clientes/${id}`);

export async function definirGrupo(clienteId: string, grupoId: string | null): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clientes").update({ grupo_id: grupoId }).eq("id", clienteId);
  if (error) return { erro: "Não foi possível alterar o grupo (sem permissão?)." };
  rev(clienteId);
  return {};
}

export async function criarGrupo(clienteId: string, nome: string): Promise<{ erro?: string }> {
  const limpo = nome.trim();
  if (!limpo) return { erro: "Informe o nome do grupo." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("grupo_economico").insert({ nome: limpo }).select("id").single();
  if (error || !data) return { erro: "Não foi possível criar o grupo (sem permissão?)." };
  return definirGrupo(clienteId, data.id as string);
}

export async function definirMatriz(clienteId: string, matrizId: string | null): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  if (matrizId) {
    const { data: alvo } = await supabase.from("clientes").select("matriz_id").eq("id", matrizId).maybeSingle();
    const erro = validarNovaMatriz(clienteId, matrizId, alvo?.matriz_id != null);
    if (erro) return { erro };
  }
  const { error } = await supabase.from("clientes").update({ matriz_id: matrizId }).eq("id", clienteId);
  if (error) return { erro: "Não foi possível definir a matriz (sem permissão?)." };
  rev(clienteId);
  return {};
}
