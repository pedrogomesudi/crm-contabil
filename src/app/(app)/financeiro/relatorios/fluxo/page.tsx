import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FluxoCaixaView } from "./FluxoCaixa";
import { relatorioFluxo } from "./fluxo-actions";

export default async function FluxoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const dados = await relatorioFluxo(ano);
  return (
    <main className="mx-auto max-w-full space-y-5 p-4">
      <Voltar href="/financeiro/relatorios" />
      <PageHeader titulo="Fluxo de caixa detalhado" subtitulo="Realizado e projetado, mês a mês, com saldo acumulado" />
      {dados ? (
        <FluxoCaixaView ano={ano} fluxo={dados.fluxo} mesAtual={dados.mesAtual} />
      ) : (
        <p className="text-sm text-negativo">Não foi possível carregar os dados.</p>
      )}
    </main>
  );
}
