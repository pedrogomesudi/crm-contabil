import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorProposta } from "./EditorProposta";
import { obterProposta } from "../../propostas-actions";

export default async function EditarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const proposta = await obterProposta(id);
  if (!proposta) notFound();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const responsavelPadrao = { nome: perfil.nome, email: user?.email ?? "" };
  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <PageHeader titulo={`Proposta nº ${proposta.numero}`} subtitulo={proposta.prospectNome} />
      <EditorProposta proposta={proposta} responsavelPadrao={responsavelPadrao} />
    </main>
  );
}
