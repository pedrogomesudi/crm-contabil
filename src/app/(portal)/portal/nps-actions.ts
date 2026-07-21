"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehCliente } from "@/lib/portal/permissoes";

// Grava pelo cliente Supabase DO USUÁRIO: a policy nps_ins_cliente (cliente_id =
// auth_cliente_id()) prova a titularidade. cliente_id vem do perfil, não do navegador.
export async function responderNps(nota: number, comentario: string): Promise<{ ok: true } | { erro: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !ehCliente(perfil.papel) || !perfil.clienteId) return { erro: "Sem permissão." };
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) return { erro: "Nota inválida." };
  const texto = (comentario ?? "").trim().slice(0, 2000) || null;
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("nps_resposta")
    .insert({ cliente_id: perfil.clienteId, nota, comentario: texto });
  if (error) return { erro: "Falha ao registrar." };
  revalidatePath("/portal");
  return { ok: true };
}
