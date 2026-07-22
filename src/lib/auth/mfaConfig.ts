import { createServerSupabase } from "@/lib/supabase/server";

// Lê o interruptor de escritório "exigir 2FA da equipe" (escritorio_config singleton id=1).
// Usado no gate do layout e na tela /conta/seguranca. RLS de select é aberta a autenticados.
export async function mfaObrigatorio(): Promise<boolean> {
  const s = await createServerSupabase();
  const { data } = await s.from("escritorio_config").select("mfa_obrigatorio").eq("id", 1).maybeSingle();
  return Boolean(data?.mfa_obrigatorio);
}
