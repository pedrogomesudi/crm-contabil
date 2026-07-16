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
// Filtra papel=contador: se contador_id apontar p/ não-contador, não retorna.
export async function contadorPorId(id: string): Promise<{ id: string; nome: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("usuarios").select("id, nome").eq("id", id).eq("papel", "contador").maybeSingle();
  return data ?? null;
}

// Valida que um id corresponde a um contador ativo (p/ atribuição no save).
export async function ehContadorValido(id: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id")
    .eq("id", id)
    .eq("papel", "contador")
    .eq("ativo", true)
    .maybeSingle();
  return !!data;
}
