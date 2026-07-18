import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricasFunil } from "../MetricasFunil";
import { listarOportunidades, listarEtapas } from "../actions";

export default async function MetricasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const [oportunidades, etapas] = await Promise.all([listarOportunidades(), listarEtapas()]);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <PageHeader titulo="Métricas do funil" subtitulo="Pipeline e fechamentos" />
      <MetricasFunil oportunidades={oportunidades} etapas={etapas} hoje={hoje} />
    </Container>
  );
}
