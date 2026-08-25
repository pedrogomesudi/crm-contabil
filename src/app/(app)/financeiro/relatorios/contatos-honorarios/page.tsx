import { Container } from "@/components/ui/Container";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContatosHonorario } from "./ContatosHonorario";
import { listarContatosHonorario } from "./actions";

export default async function ContatosHonorarioPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const linhas = await listarContatosHonorario();
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/financeiro/relatorios" />
      <PageHeader
        titulo="Contatos e honorários"
        subtitulo="Celular, e-mail, honorário mensal e dia de vencimento de cada cliente ativo, com exportação em PDF, Excel e CSV."
      />
      <ContatosHonorario linhas={linhas} />
    </Container>
  );
}
