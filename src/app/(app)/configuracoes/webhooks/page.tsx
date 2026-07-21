import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { GestaoWebhooks } from "./GestaoWebhooks";
import { listarEndpoints } from "./actions";

export const metadata = { title: "Webhooks" };

export default async function WebhooksConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const endpoints = await listarEndpoints();
  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Webhooks de saída" subtitulo="URLs que recebem eventos do CRM, assinados por HMAC" />
      <GestaoWebhooks endpoints={endpoints} />
    </Container>
  );
}
