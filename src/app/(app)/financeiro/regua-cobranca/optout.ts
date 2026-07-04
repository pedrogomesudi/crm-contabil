"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";

export async function setOptOutCobranca(clienteId: string, ativo: boolean) {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("clientes_financeiro")
    .update({ cobranca_whatsapp: ativo })
    .eq("cliente_id", clienteId);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
