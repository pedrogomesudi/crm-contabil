"use client";
import { formatarMoeda } from "@/lib/format";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";
import type { ResumoMetricas } from "@/lib/financeiro/metricas";

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

export function Indicadores({ resumo }: { resumo: ResumoMetricas }) {
  const { serie } = resumo;

  // Sem linha de totais de propósito: é série temporal, somar MRR mês a mês não
  // significa nada. Os agregados vivem nos cartões da página.
  const relatorio: RelatorioExportavel = {
    titulo: "Indicadores da carteira",
    colunas: [
      { chave: "mes", rotulo: "Mês", formato: "texto" }, // "YYYY-MM": mês de competência, não data
      { chave: "base", rotulo: "Base", formato: "numero" },
      { chave: "novos", rotulo: "Novos", formato: "numero" },
      { chave: "churn", rotulo: "Churn", formato: "numero" },
      { chave: "liquido", rotulo: "Líquido", formato: "numero" },
      { chave: "ativosFim", rotulo: "Ativos fim", formato: "numero" },
      { chave: "churnPct", rotulo: "Churn %", formato: "percent" },
      { chave: "churnReceita", rotulo: "Churn R$", formato: "moeda" },
      { chave: "mrr", rotulo: "MRR", formato: "moeda" },
      { chave: "ticketMedio", rotulo: "Ticket médio", formato: "moeda" },
      { chave: "estimado", rotulo: "Estimado", formato: "texto" },
    ],
    linhas: serie.map((m) => ({ ...m, estimado: m.estimado ? "sim" : "não" })),
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end print:hidden">
        <BotaoExportar relatorio={relatorio} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 text-right font-medium">Novos</th>
              <th className="px-3 py-2 text-right font-medium">Churn</th>
              <th className="px-3 py-2 text-right font-medium">Líquido</th>
              <th className="px-3 py-2 text-right font-medium">Ativos</th>
              <th className="px-3 py-2 text-right font-medium">Churn %</th>
              <th className="px-3 py-2 text-right font-medium">Churn R$</th>
              <th className="px-3 py-2 text-right font-medium">MRR</th>
              <th className="px-3 py-2 text-right font-medium">Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((m) => (
              <tr key={m.mes} className="border-b border-linha/60">
                <td className="px-3 py-1.5 tabular-nums">
                  {m.mes}
                  {m.estimado && (
                    <span title="Honorário estimado neste mês" className="ml-1 text-cinza">
                      *
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m.base}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-verde">{m.novos ? `+${m.novos}` : "0"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-negativo">{m.churn ? `-${m.churn}` : "0"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m.liquido > 0 ? `+${m.liquido}` : m.liquido}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{m.ativosFim}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pct(m.churnPct)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(m.churnReceita)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(m.mrr)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(m.ticketMedio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-cinza">
        O MRR de cada mês usa o <strong>honorário vigente naquele mês</strong>. Os meses marcados com <strong>*</strong>{" "}
        contêm algum honorário <strong>estimado</strong> — não há registro do valor da época, e o sistema não finge
        saber o que não sabe. O histórico real começa nas mudanças registradas a partir de julho/2026.
      </p>
    </div>
  );
}
