import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListaOnboarding } from "./ListaOnboarding";
import { listarOnboardings } from "./actions";

export default async function OnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const itens = await listarOnboardings();
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Onboarding" subtitulo="Clientes em processo de entrada" />
      <ListaOnboarding itens={itens} />
    </main>
  );
}
