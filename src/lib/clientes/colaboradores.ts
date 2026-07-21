import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PAPEIS_EQUIPE } from "@/lib/tipos";

// Colaboradores que podem ser responsáveis por departamento: equipe operacional
// ativa (admin/contador/assistente). A RLS de `usuarios` não permite listar, daí
// service_role (server-only), expondo apenas id e nome.
export async function listarColaboradores(): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome")
    .in("papel", ["admin", "contador", "assistente"])
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("Falha ao listar colaboradores:", error.message);
    return [];
  }
  return data ?? [];
}

// Equipe COMPLETA e ativa (inclui financeiro, que aponta horas e conclui tarefas) —
// diferente de listarColaboradores, que exclui financeiro por ser lista de "responsável
// por departamento". A RLS de usuarios não permite listar, daí service_role.
export async function listarEquipe(): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome")
    .in("papel", PAPEIS_EQUIPE)
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("Falha ao listar equipe:", error.message);
    return [];
  }
  return data ?? [];
}

export async function ehColaboradorValido(id: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id")
    .eq("id", id)
    .in("papel", ["admin", "contador", "assistente"])
    .eq("ativo", true)
    .maybeSingle();
  return !!data;
}
