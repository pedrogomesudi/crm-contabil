import { Container } from "@/components/ui/Container";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientesHonorario } from "./ClientesHonorario";
import { listarClientesHonorario } from "./actions";

export default async function ClientesHonorarioPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const linhas = await listarClientesHonorario();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/financeiro/relatorios" />
      <PageHeader
        titulo="Clientes e honorários"
        subtitulo="Razão social, CPF/CNPJ e honorário mensal recorrente de cada cliente ativo, com exportação em PDF, Excel e CSV."
      />
      <ClientesHonorario linhas={linhas} />
    </Container>
  );
}
