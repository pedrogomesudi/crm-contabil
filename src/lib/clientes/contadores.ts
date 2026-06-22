import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Lista contadores (id/nome) para os selects de atribuição. A RLS de `usuarios`
// só permite ler a própria linha, então usa-se service_role (server-only),
// expondo apenas id e nome de contadores ativos.
export async function listarContadores(): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome")
    .eq("papel", "contador")
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("Falha ao listar contadores:", error.message);
    return [];
  }
  return data ?? [];
}

// Busca um único contador (id/nome) — para exibição read-only sem expor a lista.
export async function contadorPorId(id: string): Promise<{ id: string; nome: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("usuarios").select("id, nome").eq("id", id).maybeSingle();
  return data ?? null;
}
