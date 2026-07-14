import { cache } from "react";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { PAPEIS, type Papel } from "@/lib/tipos";

const perfilSchema = z.object({
  nome: z.string(),
  papel: z.enum(PAPEIS),
  ativo: z.boolean(),
  cliente_id: z.string().uuid().nullable(),
});

export type PerfilAtual = { id: string; nome: string; papel: Papel; ativo: boolean; clienteId: string | null };

// Perfil do usuário logado, validado e memoizado por request (cache()):
// layout e páginas chamam sem repetir a query. Retorna null se sem sessão ou
// perfil inválido/ausente.
export const getPerfilAtual = cache(async (): Promise<PerfilAtual | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select("nome, papel, ativo, cliente_id")
    .eq("id", user.id)
    .maybeSingle();
  // Erro de infra (rede/RLS) ≠ "perfil ausente". Propaga para não deslogar um
  // usuário legítimo por um soluço transitório (quem chama trata como falha).
  if (error) throw new Error(`Falha ao carregar perfil: ${error.message}`);
  const parsed = perfilSchema.safeParse(data);
  if (!parsed.success) return null;
  const { cliente_id, ...resto } = parsed.data;
  return { id: user.id, ...resto, clienteId: cliente_id };
});
