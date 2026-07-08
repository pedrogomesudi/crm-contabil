import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Onboarding" subtitulo="Processos de entrada em andamento" />
      <div>
        <Link href="/onboarding/alertas" className="text-sm text-verde underline">
          Alertas de prazo{nAlertas > 0 ? ` (${nAlertas})` : ""}
        </Link>
      </div>
      <ListaProcessos itens={itens} hoje={hoje} />
    </main>
  );
}
