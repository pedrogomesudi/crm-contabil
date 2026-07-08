import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { QuadroComercial } from "./QuadroComercial";
import { listarOportunidades } from "./actions";

export default async function ComercialPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const oportunidades = await listarOportunidades();
  const supabase = await createServerSupabase();
  const { data: us } = await supabase.from("usuarios").select("id, nome").eq("ativo", true).order("nome");
  const usuarios = (us as { id: string; nome: string }[] | null) ?? [];
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Comercial" subtitulo="Funil de oportunidades" />
      <QuadroComercial oportunidades={oportunidades} usuarios={usuarios} />
    </main>
  );
}
