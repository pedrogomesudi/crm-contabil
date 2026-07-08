import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { GradeOrcamento } from "./GradeOrcamento";
import { listarOrcamento } from "./actions";

export default async function OrcamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const ano = new Date().getFullYear();
  const { categorias, valores } = await listarOrcamento(ano);
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <PageHeader titulo="Orçamento" subtitulo="Orçado por categoria em cada mês" />
      <GradeOrcamento ano={ano} categorias={categorias} valores={valores} />
    </main>
  );
}
