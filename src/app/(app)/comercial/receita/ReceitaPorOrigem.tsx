"use client";
import { useState } from "react";
import { controleCls } from "@/components/ui/Campo";
import { periodoBounds, type Granularidade } from "@/lib/comercial/metricas";
import { receitaPorOrigem, totalReceita, type LinhaReceita } from "@/lib/comercial/receita";
import { carregarReceitaPorOrigem } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const GRANS: { v: Granularidade; l: string }[] = [
  { v: "mes", l: "Mês" },
  { v: "trimestre", l: "Trimestre" },
  { v: "semestre", l: "Semestre" },
  { v: "ano", l: "Ano" },
];

export function ReceitaPorOrigem({ linhasIniciais, hoje }: { linhasIniciais: LinhaReceita[]; hoje: string }) {
  const [gran, setGran] = useState<Granularidade>("mes");
  const [offset, setOffset] = useState(0);
  const [tudo, setTudo] = useState(false);
  const [linhas, setLinhas] = useState<LinhaReceita[]>(linhasIniciais);
  const [ocupado, setOcupado] = useState(false);

  const fontes = receitaPorOrigem(linhas);
  const total = totalReceita(fontes);
  const rotulo = tudo ? "Todo o histórico" : periodoBounds(gran, hoje, offset).rotulo;

  async function recarregar(g = gran, o = offset, t = tudo) {
    setOcupado(true);
    const { inicio, fim } = periodoBounds(g, hoje, o);
    const novas = await carregarReceitaPorOrigem(t ? null : inicio, t ? null : fim);
    setLinhas(novas);
    setOcupado(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={gran}
          disabled={ocupado || tudo}
          onChange={(e) => {
            const g = e.target.value as Granularidade;
            setGran(g);
            setOffset(0);
            void recarregar(g, 0, tudo);
          }}
          className={controleCls("compacto")}
        >
          {GRANS.map((g) => (
            <option key={g.v} value={g.v}>
              {g.l}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={ocupado || tudo}
            onClick={() => {
              const o = offset - 1;
              setOffset(o);
              void recarregar(gran, o, tudo);
            }}
            className="rounded border border-linha px-2 disabled:opacity-40"
          >
            ←
          </button>
          <span className="min-w-[10rem] text-center text-texto">{rotulo}</span>
          <button
            type="button"
            disabled={ocupado || tudo}
            onClick={() => {
              const o = offset + 1;
              setOffset(o);
              void recarregar(gran, o, tudo);
            }}
            className="rounded border border-linha px-2 disabled:opacity-40"
          >
            →
          </button>
        </div>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            const t = !tudo;
            setTudo(t);
            void recarregar(gran, offset, t);
          }}
          className={`rounded-lg border px-3 py-1.5 text-sm ${tudo ? "border-verde bg-verde/10 text-verde" : "border-linha text-cinza hover:text-texto"}`}
        >
          Todo o histórico
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Origem</th>
              <th className="px-3 py-2 text-right font-medium">Ganhos</th>
              <th className="px-3 py-2 text-right font-medium">Valor ganho</th>
              <th className="px-3 py-2 text-right font-medium">Proposta mensal</th>
              <th className="px-3 py-2 text-right font-medium">Proposta único</th>
            </tr>
          </thead>
          <tbody>
            {fontes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-cinza">
                  Nenhum negócio ganho no período.
                </td>
              </tr>
            )}
            {fontes.map((f) => (
              <tr key={f.origem} className="border-b border-linha/60">
                <td className="px-3 py-2 text-texto">{f.origem}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.ganhos}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(f.valorGanho)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(f.propostaMensal)}/mês</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(f.propostaUnico)}</td>
              </tr>
            ))}
          </tbody>
          {fontes.length > 0 && (
            <tfoot>
              <tr className="border-t border-linha font-medium text-texto">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{total.ganhos}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(total.valorGanho)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(total.propostaMensal)}/mês</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(total.propostaUnico)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
