import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorModelo } from "./EditorModelo";
import { listarModelo } from "@/app/(app)/onboarding/actions";

export default async function ConfigOnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const itens = await listarModelo();
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Checklist de onboarding" subtitulo="Itens-modelo aplicados a cada novo cliente" />
      <EditorModelo itens={itens} />
    </main>
  );
}
