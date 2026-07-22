import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormSeguranca } from "./FormSeguranca";
import { carregarSeguranca } from "./actions";

export const metadata = { title: "Segurança (2FA)" };

export default async function SegurancaConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const { obrigatorio } = await carregarSeguranca();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Segurança (2FA)" subtitulo="Exigir verificação em duas etapas da equipe" />
      <FormSeguranca obrigatorio={obrigatorio} />
    </Container>
  );
}
