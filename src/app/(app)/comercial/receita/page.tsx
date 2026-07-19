import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { ReceitaPorOrigem } from "./ReceitaPorOrigem";
import { carregarReceitaPorOrigem } from "./actions";
import { periodoBounds } from "@/lib/comercial/metricas";

export const metadata = { title: "Receita por origem" };

export default async function ReceitaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { inicio, fim } = periodoBounds("mes", hoje, 0);
  const linhas = await carregarReceitaPorOrigem(inicio, fim);
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/comercial" label="Comercial" />
      <PageHeader titulo="Receita por origem" subtitulo="Quanto cada fonte trouxe de receita" />
      <ReceitaPorOrigem linhasIniciais={linhas} hoje={hoje} />
    </Container>
  );
}
