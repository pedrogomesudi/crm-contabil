import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfilAtual();
  // Sem sessão, sem perfil válido ou desativado => encerra sessão (evita loop) e
  // manda ao login.
  if (!perfil || !perfil.ativo) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar papel={perfil.papel} nome={perfil.nome} />
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
