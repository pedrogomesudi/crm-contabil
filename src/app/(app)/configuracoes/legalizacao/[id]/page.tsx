import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { obterModelo } from "../actions";
import { EditorModelo } from "./EditorModelo";

export default async function EditarModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const modelo = await obterModelo(id);
  if (!modelo) notFound();
  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <Link href="/configuracoes/legalizacao" className="text-sm text-verde underline">
        ← Modelos de legalização
      </Link>
      <PageHeader titulo={modelo.nome} subtitulo="Metadados e etapas do modelo" />
      <EditorModelo modelo={modelo} />
    </main>
  );
}
