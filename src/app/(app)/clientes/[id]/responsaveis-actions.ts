"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehColaboradorValido } from "@/lib/clientes/colaboradores";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";
import type { Departamento } from "@/lib/clientes/departamentos";

const DEPTOS = new Set<Departamento>(["contabil", "fiscal", "pessoal", "societario"]);

export async function definirResponsavel(clienteId: string, departamento: Departamento, usuarioId: string | null): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo) return { erro: "Sem permissão." };
  if (!DEPTOS.has(departamento)) return { erro: "Departamento inválido." };

  // admin/assistente sempre; contador só no cliente dele (a RLS reforça).
  const supabase = await createServerSupabase();
  let autorizado = podeGerenciarResponsaveis(perfil.papel);
  if (!autorizado && perfil.papel === "contador") {
    const { data: c } = await supabase.from("clientes").select("id").eq("id", clienteId).maybeSingle();
    autorizado = Boolean(c); // a RLS de clientes já limita o contador aos seus
  }
  if (!autorizado) return { erro: "Sem permissão." };

  if (usuarioId === null) {
    const { error } = await supabase.from("cliente_responsavel").delete().eq("cliente_id", clienteId).eq("departamento", departamento);
    if (error) return { erro: "Falha ao remover responsável." };
  } else {
    if (!(await ehColaboradorValido(usuarioId))) return { erro: "Colaborador inválido." };
    const { error } = await supabase.from("cliente_responsavel").upsert(
      { cliente_id: clienteId, departamento, usuario_id: usuarioId },
      { onConflict: "cliente_id,departamento" },
    );
    if (error) return { erro: "Falha ao salvar responsável." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
