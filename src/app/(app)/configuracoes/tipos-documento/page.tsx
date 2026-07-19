import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { TiposDocumentoLista } from "./TiposDocumentoLista";
import { listarTiposDocumento } from "./actions";

export const metadata = { title: "Tipos de documento" };

export default async function TiposDocumentoConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const tipos = await listarTiposDocumento();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Tipos de documento" subtitulo="Catálogo do GED — tipo e departamento sugerido" />
      <TiposDocumentoLista tipos={tipos} />
    </Container>
  );
}
