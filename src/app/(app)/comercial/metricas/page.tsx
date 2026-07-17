import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricasFunil } from "../MetricasFunil";
import { listarOportunidades } from "../actions";

export default async function MetricasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const oportunidades = await listarOportunidades();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="mx-auto max-w-[1280px] space-y-5 p-4">
      <PageHeader titulo="Métricas do funil" subtitulo="Pipeline e fechamentos" />
      <MetricasFunil oportunidades={oportunidades} hoje={hoje} />
    </main>
  );
}
