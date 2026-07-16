import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { formatarMoeda } from "@/lib/format";
import { Indicadores } from "./Indicadores";
import { carregarIndicadores } from "./actions";

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl border border-linha bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-cinza">{titulo}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-texto">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-cinza">{detalhe}</p>}
    </div>
  );
}

export default async function IndicadoresPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const resumo = await carregarIndicadores();
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader titulo="Indicadores" subtitulo="Ticket médio, MRR, churn e crescimento da carteira" />
      {!resumo ? (
        <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Sem dados para exibir.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cartao titulo="MRR" valor={formatarMoeda(resumo.atual.mrr)} />
            <Cartao titulo="Ticket médio" valor={formatarMoeda(resumo.atual.ticketMedio)} />
            <Cartao titulo="Clientes ativos" valor={String(resumo.atual.ativos)} />
            <Cartao
              titulo="Churn do mês"
              valor={`${resumo.atual.churnPct.toFixed(1).replace(".", ",")}%`}
              detalhe={`${formatarMoeda(resumo.atual.churnReceita)} em receita`}
            />
          </div>
          <Indicadores resumo={resumo} />
        </>
      )}
    </main>
  );
}
