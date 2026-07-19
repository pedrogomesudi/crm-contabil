import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { CamposCustomLista } from "./CamposCustomLista";
import { listarCamposCustom } from "./actions";

export const metadata = { title: "Campos customizáveis" };

export default async function CamposCustomConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const campos = await listarCamposCustom();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader
        titulo="Campos customizáveis"
        subtitulo="Campos extras do cadastro do cliente — tipo e obrigatoriedade"
      />
      <CamposCustomLista campos={campos} />
    </Container>
  );
}
