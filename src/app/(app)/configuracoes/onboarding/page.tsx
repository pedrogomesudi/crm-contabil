import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { GerenciadorTemplates } from "./GerenciadorTemplates";
import { listarTemplates } from "@/app/(app)/onboarding/template-actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const templates = await listarTemplates();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Template de onboarding" subtitulo="Modelos de processo de entrada de clientes" />
      <GerenciadorTemplates templates={templates} />
    </main>
  );
}
