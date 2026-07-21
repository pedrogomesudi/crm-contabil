import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormNps } from "./FormNps";
import { carregarNps } from "./actions";

export const metadata = { title: "Pesquisa de satisfação (NPS)" };

export default async function NpsConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarNps();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Pesquisa de satisfação (NPS)" subtitulo="Coleta automática de NPS no portal do cliente" />
      <FormNps cfg={cfg} />
    </Container>
  );
}
