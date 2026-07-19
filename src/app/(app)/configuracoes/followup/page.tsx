import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormFollowup } from "./FormFollowup";
import { carregarFollowup } from "./actions";

export const metadata = { title: "Follow-up de propostas" };

export default async function FollowupConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarFollowup();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Follow-up de propostas" subtitulo="Sequência automática após o envio da proposta" />
      <FormFollowup cfg={cfg} />
    </Container>
  );
}
