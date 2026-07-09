import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorProposta } from "./EditorProposta";
import { obterProposta } from "../../propostas-actions";

export default async function EditarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const proposta = await obterProposta(id);
  if (!proposta) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo={`Proposta nº ${proposta.numero}`} subtitulo={proposta.prospectNome} />
      <EditorProposta proposta={proposta} />
    </main>
  );
}
