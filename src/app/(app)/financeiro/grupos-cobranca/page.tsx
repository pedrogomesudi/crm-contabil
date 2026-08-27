import { Container } from "@/components/ui/Container";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { GruposCobranca } from "@/components/financeiro/GruposCobranca";
import { listarGrupos, listarClientesSemGrupo } from "./actions";

export default async function GruposCobrancaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const [grupos, semGrupo] = await Promise.all([listarGrupos(), listarClientesSemGrupo()]);
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader
        titulo="Grupos de cobrança"
        subtitulo="Empresas cobradas por um único boleto (na titular), mantendo a NF individual por CNPJ."
      />
      <GruposCobranca gruposIni={grupos} semGrupoIni={semGrupo} />
    </Container>
  );
}
