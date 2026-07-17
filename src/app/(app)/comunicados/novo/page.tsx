import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarContadores } from "@/lib/clientes/contadores";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTemplatesEmail } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormComunicado } from "./FormComunicado";
import { Voltar } from "@/components/ui/Voltar";

export const metadata = { title: "Novo comunicado" };

export default async function NovoComunicadoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTemplatesEmail(perfil.papel)) redirect("/");
  const contadores = await listarContadores();
  const colaboradores = await listarColaboradores();

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/comunicados" label="Comunicados" />
      <PageHeader titulo="Novo comunicado" subtitulo="Escreva, segmente, confira a prévia e dispare" />
      <FormComunicado contadores={contadores} colaboradores={colaboradores} />
    </Container>
  );
}
