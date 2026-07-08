import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorTemplate } from "./EditorTemplate";
import { listarTemplate } from "@/app/(app)/onboarding/template-actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const template = await listarTemplate();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Template de onboarding" subtitulo="Blocos e itens do processo de entrada de clientes" />
      <EditorTemplate template={template} />
    </main>
  );
}
