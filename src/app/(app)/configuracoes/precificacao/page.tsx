import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormPrecificacao } from "./FormPrecificacao";
import { carregarPrecificacao } from "./actions";

export const metadata = { title: "Precificação" };

export default async function PrecificacaoConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarPrecificacao();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Precificação" subtitulo="Regras de honorários — base, acréscimos, complexidade e serviços" />
      <FormPrecificacao cfg={cfg} />
    </Container>
  );
}
