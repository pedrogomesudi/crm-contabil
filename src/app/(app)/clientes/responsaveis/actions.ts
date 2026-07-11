"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehColaboradorValido } from "@/lib/clientes/colaboradores";
import { podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";
import type { Departamento } from "@/lib/clientes/departamentos";

const DEPTOS = new Set<Departamento>(["contabil", "fiscal", "pessoal", "societario"]);

export async function atribuirEmMassa(clienteIds: string[], departamento: Departamento, usuarioId: string | null): Promise<{ ok?: boolean; erro?: string; n?: number }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarResponsaveis(perfil.papel)) return { erro: "Sem permissão." };
  if (!DEPTOS.has(departamento)) return { erro: "Departamento inválido." };
  const ids = [...new Set(clienteIds)].filter(Boolean);
  if (ids.length === 0) return { erro: "Selecione ao menos um cliente." };

  const supabase = await createServerSupabase();
  if (usuarioId === null) {
    const { error } = await supabase.from("cliente_responsavel").delete().in("cliente_id", ids).eq("departamento", departamento);
    if (error) return { erro: "Falha ao remover." };
  } else {
    if (!(await ehColaboradorValido(usuarioId))) return { erro: "Colaborador inválido." };
    const linhas = ids.map((cliente_id) => ({ cliente_id, departamento, usuario_id: usuarioId }));
    const { error } = await supabase.from("cliente_responsavel").upsert(linhas, { onConflict: "cliente_id,departamento" });
    if (error) return { erro: "Falha ao atribuir." };
  }
  return { ok: true, n: ids.length };
}
