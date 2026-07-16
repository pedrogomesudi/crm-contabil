"use client";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { LinhaRelatorio, RelatorioExportavel } from "@/lib/exportar/tipos";
import { relatorioFluxo } from "./fluxo-actions";
import type { FluxoCaixa, GrupoFluxo } from "@/lib/financeiro/fluxo-caixa";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const cor = (v: number) => (v < 0 ? "text-negativo" : "");

export function FluxoCaixaView({
  ano: anoIni,
  fluxo: fluxoIni,
  mesAtual: mesAtualIni,
}: {
  ano: number;
  fluxo: FluxoCaixa;
  mesAtual: number;
}) {
  const [ano, setAno] = useState(anoIni);
  const [fluxo, setFluxo] = useState<FluxoCaixa>(fluxoIni);
  const [mesAtual, setMesAtual] = useState(mesAtualIni);
  const [carregando, setCarregando] = useState(false);

  const anos = Array.from({ length: 6 }, (_, i) => anoIni + 1 - i);

  async function trocarAno(a: number) {
    setAno(a);
    setCarregando(true);
    const r = await relatorioFluxo(a);
    if (r) {
      setFluxo(r.fluxo);
      setMesAtual(r.mesAtual);
    }
    setCarregando(false);
  }

  // mês (1..12) é projetado?
  const projetado = (m: number) => (mesAtual === 0 ? false : mesAtual >= 13 ? true : m > mesAtual);
  const vazio = fluxo.entradas.linhas.length === 0 && fluxo.saidas.linhas.length === 0;
  const resultadoTotal = fluxo.entradas.total - fluxo.saidas.total;

  // A tela é uma matriz pivotada (Categoria × Jan..Dez) com VÁRIAS linhas de fechamento,
  // e o relatório exportável tem só uma. Então achata igual ao CSV que existia aqui: os
  // fechamentos viram linhas comuns e o saldo acumulado — o fecho de fato — vai em `totais`.
  // Seu total fica vazio de propósito: saldo acumulado não se soma (é o mesmo "—" da tela).
  const linhaFluxo = (categoria: string, valores: number[], total: number | null): LinhaRelatorio =>
    Object.fromEntries([
      ["categoria", categoria],
      ...valores.map((v, i) => [`m${i}`, v] as const),
      ["total", total],
    ]);

  const relatorio: RelatorioExportavel = {
    titulo: "Fluxo de caixa",
    subtitulo: `Ano de ${ano}`,
    colunas: [
      { chave: "categoria", rotulo: "Categoria", formato: "texto" },
      ...MES.map((m, i) => ({ chave: `m${i}`, rotulo: m, formato: "moeda" as const })),
      { chave: "total", rotulo: "Total", formato: "moeda" as const },
    ],
    linhas: [
      ...fluxo.entradas.linhas.map((l) => linhaFluxo(l.nome, l.valores, l.total)),
      linhaFluxo("Total de entradas", fluxo.entradas.totais, fluxo.entradas.total),
      ...fluxo.saidas.linhas.map((l) => linhaFluxo(l.nome, l.valores, l.total)),
      linhaFluxo("Total de saídas", fluxo.saidas.totais, fluxo.saidas.total),
      linhaFluxo("Resultado do mês", fluxo.resultadoMes, resultadoTotal),
    ],
    totais: linhaFluxo("Saldo acumulado", fluxo.saldoAcumulado, null),
  };

  const cel = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
  const th = (m: number) => `px-2 py-2 text-right font-medium ${projetado(m) ? "bg-creme" : ""}`;
  const tdMes = (m: number, v: number) => `${cel} ${projetado(m) ? "bg-creme" : ""} ${cor(v)}`;

  function linhasGrupo(grupo: GrupoFluxo) {
    return (
      <>
        <tr>
          <td
            colSpan={14}
            className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-cinza"
          >
            {grupo.titulo}
          </td>
        </tr>
        {grupo.linhas.length === 0 && (
          <tr>
            <td colSpan={14} className="px-3 py-1 text-xs text-cinza">
              —
            </td>
          </tr>
        )}
        {grupo.linhas.map((l) => (
          <tr key={l.categoriaId} className="border-b border-linha/40">
            <td className="px-3 py-1 text-texto whitespace-nowrap">{l.nome}</td>
            {l.valores.map((v, i) => (
              <td key={i} className={tdMes(i + 1, v)}>
                {formatarMoeda(v)}
              </td>
            ))}
            <td className={`${cel} font-medium`}>{formatarMoeda(l.total)}</td>
          </tr>
        ))}
        <tr className="border-b border-linha font-medium">
          <td className="px-3 py-1 text-texto">Total {grupo.titulo.toLowerCase()}</td>
          {grupo.totais.map((v, i) => (
            <td key={i} className={tdMes(i + 1, v)}>
              {formatarMoeda(v)}
            </td>
          ))}
          <td className={cel}>{formatarMoeda(grupo.total)}</td>
        </tr>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select
          value={ano}
          onChange={(e) => trocarAno(Number(e.target.value))}
          className="rounded-lg border border-linha px-2 py-1 text-sm"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {carregando && <span className="text-xs text-cinza">Carregando…</span>}
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

      {vazio ? (
        <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">
          Sem movimentações no período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                {MES.map((m, i) => (
                  <th key={m} className={th(i + 1)}>
                    {m}
                    {(mesAtual >= 1 && mesAtual <= 12 && i + 1 === mesAtual + 1) ||
                    (mesAtual >= 13 && i === 0) ? (
                      <span className="block text-[9px] font-normal normal-case text-verde">
                        projetado →
                      </span>
                    ) : null}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhasGrupo(fluxo.entradas)}
              {linhasGrupo(fluxo.saidas)}
              <tr className="border-t-2 border-linha font-medium">
                <td className="px-3 py-1.5 text-texto">Resultado do mês</td>
                {fluxo.resultadoMes.map((v, i) => (
                  <td key={i} className={tdMes(i + 1, v)}>
                    {formatarMoeda(v)}
                  </td>
                ))}
                <td className={`${cel} ${cor(resultadoTotal)}`}>{formatarMoeda(resultadoTotal)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="px-3 py-1.5 text-texto">Saldo acumulado</td>
                {fluxo.saldoAcumulado.map((v, i) => (
                  <td key={i} className={tdMes(i + 1, v)}>
                    {formatarMoeda(v)}
                  </td>
                ))}
                <td className={cel}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
