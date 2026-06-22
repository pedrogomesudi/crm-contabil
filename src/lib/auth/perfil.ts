import { cache } from "react";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { PAPEIS, type Papel } from "@/lib/tipos";

const perfilSchema = z.object({
  nome: z.string(),
  papel: z.enum(PAPEIS),
  ativo: z.boolean(),
});

export type PerfilAtual = { id: string; nome: string; papel: Papel; ativo: boolean };

// Perfil do usuário logado, validado e memoizado por request (cache()):
// layout e páginas chamam sem repetir a query. Retorna null se sem sessão ou
// perfil inválido/ausente.
export const getPerfilAtual = cache(async (): Promise<PerfilAtual | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("nome, papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  const parsed = perfilSchema.safeParse(data);
  if (!parsed.success) return null;
  return { id: user.id, ...parsed.data };
});
