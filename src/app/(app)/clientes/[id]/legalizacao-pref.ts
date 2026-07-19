"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";

export async function definirComunicacaoLegalizacao(
  clienteId: string,
  on: boolean,
): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarLegalizacao(p.papel)) return { erro: "Sem permissão." };
  const s = await createServerSupabase();
  const { error } = await s.from("clientes").update({ comunicar_legalizacao: on }).eq("id", clienteId);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
