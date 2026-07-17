import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { ehCliente } from "@/lib/portal/permissoes";
import { sair } from "@/app/login/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
    redirect("/login");
  }
  // Gate espelhado: só o papel 'cliente' entra no portal; a equipe volta para o app.
  if (!ehCliente(perfil.papel)) redirect("/");

  const supabase = await createServerSupabase();
  // A RLS do portal só devolve o próprio cadastro.
  const { data: cliente } = await supabase.from("clientes").select("razao_social").maybeSingle();
  const { data: marca } = await supabase.from("escritorio_config").select("nome").eq("id", 1).maybeSingle();

  const nav = [
    { href: "/portal", label: "Início" },
    { href: "/portal/documentos", label: "Documentos" },
    { href: "/portal/notas", label: "Notas fiscais" },
    { href: "/portal/guias", label: "Guias" },
    { href: "/portal/boletos", label: "Boletos" },
    { href: "/portal/solicitacoes", label: "Solicitações" },
  ];

  return (
    <div className="min-h-screen bg-creme">
      <header className="border-b border-linha bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="font-display text-base font-bold text-texto">
              {(marca?.nome as string) ?? "Portal do cliente"}
            </p>
            <p className="text-xs text-cinza">{(cliente?.razao_social as string) ?? perfil.nome}</p>
          </div>
          <form action={sair}>
            <button className="rounded-lg border border-linha px-3 py-1.5 text-sm text-cinza">Sair</button>
          </form>
        </div>
        <nav aria-label="Portal" className="mx-auto flex max-w-[1280px] flex-wrap gap-1 px-4 pb-2 text-sm">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-cinza hover:bg-creme">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1280px] p-4">{children}</main>
    </div>
  );
}
