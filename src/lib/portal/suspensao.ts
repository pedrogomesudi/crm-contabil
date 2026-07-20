import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

// true se o cliente logado no portal está suspenso. Memoizado por request:
// layout e páginas chamam sem repetir a query. RLS (clientes_portal_sel) devolve
// só o próprio cadastro.
export const portalSuspenso = cache(async (): Promise<boolean> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("clientes").select("suspenso").maybeSingle();
  return Boolean(data?.suspenso);
});
