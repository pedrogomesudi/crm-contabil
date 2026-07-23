import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { listarModelos } from "./actions";
import { ModelosLista } from "./ModelosLista";
import { carregarComunicacaoLeg } from "./comunicacao-actions";
import { FormComunicacaoLeg } from "./FormComunicacaoLeg";

export const metadata = { title: "Modelos de legalização" };

export default async function ModelosLegalizacaoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const [modelos, comunicacao] = await Promise.all([listarModelos(), carregarComunicacaoLeg()]);
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader
        titulo="Modelos de legalização"
        subtitulo="Processos societários e de legalização — etapas por órgão"
      />
      <FormComunicacaoLeg cfg={comunicacao} />
      <ModelosLista modelos={modelos} />
    </Container>
  );
}
