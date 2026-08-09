"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { canalParaFlags, type CanalCobranca } from "@/lib/clientes/canal-cobranca";

// Opt-out POR CANAL. Desde a fatia B da régua, desligar o WhatsApp não silencia o cliente:
// o e-mail assume. Para silêncio total, desligue os dois.
export async function setOptOutCobranca(
  clienteId: string,
  canais: { whatsapp?: boolean; email?: boolean },
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return { erro: "Sem permissão." };

  const dados: Record<string, boolean> = {};
  if (canais.whatsapp !== undefined) dados.cobranca_whatsapp = canais.whatsapp;
  if (canais.email !== undefined) dados.cobranca_email = canais.email;
  if (Object.keys(dados).length === 0) return { ok: true };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clientes_financeiro").update(dados).eq("cliente_id", clienteId);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

// Grava o canal de cobrança (3 opções) nos dois flags de uma vez. Usada pela ficha do cliente.
// Upsert porque a linha de clientes_financeiro pode ainda não existir.
export async function definirCanalCobranca(
  clienteId: string,
  canal: CanalCobranca,
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return { erro: "Sem permissão." };
  const flags = canalParaFlags(canal);
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("clientes_financeiro")
    .upsert(
      { cliente_id: clienteId, cobranca_whatsapp: flags.whatsapp, cobranca_email: flags.email },
      { onConflict: "cliente_id" },
    );
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
