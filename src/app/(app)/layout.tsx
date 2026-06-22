import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import type { Papel } from "@/lib/tipos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nome, papel, ativo")
    .eq("id", user.id)
    .single();
  // Sem perfil ou desativado => sem acesso.
  if (!perfil || !perfil.ativo) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar papel={perfil.papel as Papel} nome={perfil.nome as string} />
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
