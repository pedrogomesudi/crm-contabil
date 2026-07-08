import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { contarAlertas } from "@/app/(app)/onboarding/alertas-actions";
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

  const alertasOnboarding = podeCriarCliente(perfil.papel) ? await contarAlertas() : 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-texto focus:shadow"
      >
        Pular para o conteúdo
      </a>
      <Sidebar papel={perfil.papel} nome={perfil.nome} alertasOnboarding={alertasOnboarding} />
      <main id="conteudo" className="flex-1 bg-creme p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
