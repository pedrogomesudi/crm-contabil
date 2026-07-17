import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorTemplate } from "../EditorTemplate";
import { obterTemplate } from "@/app/(app)/onboarding/template-actions";

export default async function EditorTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const template = await obterTemplate(id);
  if (!template) notFound();
  return (
    <main className="mx-auto max-w-[1280px] space-y-5 p-4">
      <PageHeader titulo={template.nome} subtitulo="Blocos e itens do template" />
      <EditorTemplate template={template} />
    </main>
  );
}
