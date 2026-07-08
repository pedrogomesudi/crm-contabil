import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { DashboardComparativo } from "./DashboardComparativo";
import { dashboardOrcadoRealizado } from "./actions";

export default async function OrcadoRealizadoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const agora = new Date();
  const ano = agora.getFullYear();
  const indice = agora.getMonth() + 1;
  const dados = await dashboardOrcadoRealizado(ano, "mes", indice, "competencia");
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <PageHeader titulo="Orçado × Realizado" subtitulo="Comparativo do orçamento com o realizado" />
      {dados ? (
        <DashboardComparativo ano={ano} tipo="mes" indice={indice} base="competencia" categorias={dados.categorias} comparativo={dados.comparativo} />
      ) : (
        <p className="text-sm text-cinza">Sem acesso ao financeiro.</p>
      )}
    </main>
  );
}
