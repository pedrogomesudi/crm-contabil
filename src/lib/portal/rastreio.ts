import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type TipoAcesso = "documento" | "nfse" | "obrigacao" | "boleto";

// Rastreio de entrega (RF-053): último acesso do cliente por item.
// A RLS de portal_acesso já limita à visibilidade do cliente pela equipe.
export async function ultimosAcessos(clienteId: string, tipo: TipoAcesso): Promise<Map<string, string>> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("portal_acesso")
    .select("ref_id, acessado_em")
    .eq("cliente_id", clienteId)
    .eq("tipo", tipo)
    .order("acessado_em", { ascending: false });
  const mapa = new Map<string, string>();
  for (const a of data ?? []) {
    const ref = a.ref_id as string;
    if (!mapa.has(ref)) mapa.set(ref, a.acessado_em as string); // já vem ordenado desc
  }
  return mapa;
}
