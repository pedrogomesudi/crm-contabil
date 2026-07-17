import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarRecorrencias } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarTemplatesSop } from "./actions";
import { FormSop } from "./FormSop";
import { Voltar } from "@/components/ui/Voltar";

export const metadata = { title: "Modelos de processo (SOPs)" };

export default async function SopPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarRecorrencias(perfil.papel)) redirect("/");
  const templates = await listarTemplatesSop();

  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader
        titulo="Modelos de processo (SOPs)"
        subtitulo="Etapas que viram tarefas — em ondas paralelas e sequenciais"
      />
      <FormSop templates={templates} />
    </Container>
  );
}
