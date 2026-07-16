"use client";
import { useState } from "react";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";
import { relatorioConformidade, type RelatorioConformidade as Rel } from "../conformidade-actions";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const corPct = (p: number) => (p < 70 ? "text-negativo" : p < 90 ? "text-texto" : "text-verde");

export function RelatorioConformidade({
  ano: anoIni,
  mes: mesIni,
  dados: dadosIni,
}: {
  ano: number;
  mes: number;
  dados: Rel;
}) {
  const [ano, setAno] = useState(anoIni);
  const [mes, setMes] = useState(mesIni); // 0 = ano inteiro
  const [dados, setDados] = useState(dadosIni);
  const anos = Array.from({ length: 5 }, (_, i) => anoIni + 1 - i);

  async function recarregar(a: number, m: number) {
    setAno(a);
    setMes(m);
    setDados(await relatorioConformidade(a, m === 0 ? null : m));
  }

  // O resumo é aninhado (l.resumo.total) e o relatório é plano por chave: achata.
  // O "geral" era a primeira linha do CSV chamada GERAL; como linha de fechamento
  // ele é o que sempre foi — o total da carteira.
  const achatar = (clienteNome: string, r: Rel["geral"]) => ({ clienteNome, ...r });
  const relatorio: RelatorioExportavel = {
    titulo: "Conformidade de obrigações",
    subtitulo: mes ? `${MES[mes - 1]}/${ano}` : `Ano de ${ano}`,
    colunas: [
      { chave: "clienteNome", rotulo: "Cliente", formato: "texto" },
      { chave: "total", rotulo: "Total", formato: "numero" },
      { chave: "noPrazo", rotulo: "No prazo", formato: "numero" },
      { chave: "comAtraso", rotulo: "Com atraso", formato: "numero" },
      { chave: "pendenteVencida", rotulo: "Pendente vencida", formato: "numero" },
      { chave: "pendenteNoPrazo", rotulo: "Pendente no prazo", formato: "numero" },
      { chave: "dispensada", rotulo: "Dispensada", formato: "numero" },
      { chave: "pctConformidade", rotulo: "% conformidade", formato: "percent" },
    ],
    linhas: dados.porCliente.map((l) => achatar(l.clienteNome, l.resumo)),
    totais: achatar("GERAL", dados.geral),
  };

  const g = dados.geral;
  const card = "rounded-2xl border border-linha bg-white p-3 text-center";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select
          value={mes}
          onChange={(e) => recarregar(ano, Number(e.target.value))}
          className="rounded-lg border border-linha px-2 py-1 text-sm"
        >
          <option value={0}>Ano inteiro</option>
          {MES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => recarregar(Number(e.target.value), mes)}
          className="rounded-lg border border-linha px-2 py-1 text-sm"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <BotaoExportar relatorio={relatorio} />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-linha px-3 py-1.5 text-sm"
          >
            Imprimir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className={card}>
          <div className={`text-2xl font-bold ${corPct(g.pctConformidade)}`}>
            {g.pctConformidade}%
          </div>
          <div className="text-xs text-cinza">Conformidade</div>
        </div>
        <div className={card}>
          <div className="text-2xl font-bold text-texto">{g.total}</div>
          <div className="text-xs text-cinza">Total</div>
        </div>
        <div className={card}>
          <div className="text-2xl font-bold text-verde">{g.noPrazo}</div>
          <div className="text-xs text-cinza">No prazo</div>
        </div>
        <div className={card}>
          <div className="text-2xl font-bold text-negativo">{g.comAtraso}</div>
          <div className="text-xs text-cinza">Com atraso</div>
        </div>
        <div className={card}>
          <div className="text-2xl font-bold text-negativo">{g.pendenteVencida}</div>
          <div className="text-xs text-cinza">Pend. vencida</div>
        </div>
        <div className={card}>
          <div className="text-2xl font-bold text-cinza">{g.dispensada}</div>
          <div className="text-xs text-cinza">Dispensada</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">No prazo</th>
              <th className="px-3 py-2 text-right font-medium">Com atraso</th>
              <th className="px-3 py-2 text-right font-medium">Pend. vencida</th>
              <th className="px-3 py-2 text-right font-medium">Dispensada</th>
              <th className="px-3 py-2 text-right font-medium">% conf.</th>
            </tr>
          </thead>
          <tbody>
            {dados.porCliente.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-cinza">
                  Sem obrigações no período.
                </td>
              </tr>
            )}
            {dados.porCliente.map((l) => (
              <tr key={l.clienteNome} className="border-b border-linha/60">
                <td className="px-3 py-1.5 text-texto">{l.clienteNome}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.total}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.noPrazo}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.comAtraso}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.pendenteVencida}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.resumo.dispensada}</td>
                <td
                  className={`px-3 py-1.5 text-right font-medium tabular-nums ${corPct(l.resumo.pctConformidade)}`}
                >
                  {l.resumo.pctConformidade}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
