import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubNav } from "@/components/ui/SubNav";
import { ListaProcessos } from "./ListaProcessos";
import { listarProcessos } from "./processos-actions";
import { contarAlertas } from "./alertas-actions";

export default async function OnboardingPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const itens = await listarProcessos();
  const nAlertas = await contarAlertas();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="mx-auto max-w-[1280px] space-y-5 p-4">
      <PageHeader titulo="Onboarding" subtitulo="Processos de entrada em andamento" />
      <SubNav
        itens={[
          { href: "/onboarding", label: "Processos" },
          { href: "/onboarding/alertas", label: "Alertas de prazo", badge: nAlertas || undefined },
        ]}
      />
      <ListaProcessos itens={itens} hoje={hoje} />
    </main>
  );
}
