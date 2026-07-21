import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { FormReceita } from "./FormReceita";
import { carregarReceitaConfig } from "./actions";

export const metadata = { title: "Monitoramento da Receita" };

export default async function ReceitaConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const cfg = await carregarReceitaConfig();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Monitoramento da Receita" subtitulo="Reconsulta automática de situação cadastral e Simples" />
      <FormReceita cfg={cfg} />
    </Container>
  );
}
