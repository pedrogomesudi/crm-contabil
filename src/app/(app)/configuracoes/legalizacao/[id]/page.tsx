import { Container } from "@/components/ui/Container";
import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { obterModelo } from "../actions";
import { EditorModelo } from "./EditorModelo";
import { Voltar } from "@/components/ui/Voltar";

export default async function EditarModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const modelo = await obterModelo(id);
  if (!modelo) notFound();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes/legalizacao" label="Modelos de legalização" />
      <PageHeader titulo={modelo.nome} subtitulo="Metadados e etapas do modelo" />
      <EditorModelo modelo={modelo} />
    </Container>
  );
}
