import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { PAPEIS } from "@/lib/tipos";

const perfilSchema = z.object({
  nome: z.string(),
  papel: z.enum(PAPEIS),
  ativo: z.boolean(),
});

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfilRaw } = await supabase
    .from("usuarios")
    .select("nome, papel, ativo")
    .eq("id", user.id)
    .single();

  // Valida em runtime (sem tipos gerados do Supabase): papel deve ser um enum
  // válido e o usuário deve estar ativo. Caso contrário, encerra a sessão para
  // NÃO entrar em loop de redirect (perfil ausente/inativo/corrompido).
  const parsed = perfilSchema.safeParse(perfilRaw);
  if (!parsed.success || !parsed.data.ativo) {
    await supabase.auth.signOut();
    redirect("/login");
  }
  const perfil = parsed.data;

  return (
    <div className="flex min-h-screen">
      <Sidebar papel={perfil.papel} nome={perfil.nome} />
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
