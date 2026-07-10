"use client";
import { formatarMoeda } from "@/lib/format";
import { paraCSV } from "@/lib/financeiro/csv";
import type { ResumoMetricas } from "@/lib/financeiro/metricas";

function baixar(nome: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

export function Indicadores({ resumo }: { resumo: ResumoMetricas }) {
  const { serie } = resumo;
  function exportar() {
    const csv = paraCSV(
      ["Mês", "Base", "Novos", "Churn", "Líquido", "Ativos fim", "Churn %", "Churn R$", "MRR", "Ticket médio", "Estimado"],
      serie.map((m) => [m.mes, String(m.base), String(m.novos), String(m.churn), String(m.liquido), String(m.ativosFim), pct(m.churnPct), formatarMoeda(m.churnReceita), formatarMoeda(m.mrr), formatarMoeda(m.ticketMedio), m.estimado ? "sim" : "não"]),
    );
    baixar("indicadores-carteira.csv", csv);
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end print:hidden">
        <button type="button" onClick={exportar} className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm font-medium text-texto hover:bg-creme">Exportar CSV</button>
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
        O MRR de cada mês usa o <strong>honorário vigente naquele mês</strong>. Os meses marcados com{" "}
        <strong>*</strong> contêm algum honorário <strong>estimado</strong> — não há registro do valor da
        época, e o sistema não finge saber o que não sabe. O histórico real começa nas mudanças
        registradas a partir de julho/2026.
      </p>
    </div>
  );
}
