import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { RelatorioDRE } from "./RelatorioDRE";
import { relatorioDRE } from "./dre-actions";

export default async function DREPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const inicial = await relatorioDRE(ano, "mes", mes, "competencia");
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/financeiro/relatorios" />
      <PageHeader titulo="DRE" subtitulo="Demonstração de Resultado" />
      <RelatorioDRE ano={ano} tipo="mes" indice={mes} base="competencia" dre={inicial?.dre ?? null} />
    </Container>
  );
}
