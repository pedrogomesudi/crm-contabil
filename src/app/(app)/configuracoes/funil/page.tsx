import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { EtapasFunil } from "./EtapasFunil";
import { listarEtapasConfig } from "./actions";

export const metadata = { title: "Funil comercial" };

export default async function FunilConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const etapas = await listarEtapasConfig();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Funil comercial" subtitulo="Etapas do pipeline — rótulo, cor, probabilidade e ordem" />
      <EtapasFunil etapas={etapas} />
    </Container>
  );
}
