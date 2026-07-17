"use client";
import { useState } from "react";
import { ETAPAS_ATIVAS } from "@/lib/comercial/funil";
import { periodoBounds, metricasFunil, type Granularidade } from "@/lib/comercial/metricas";
import type { OportunidadeView } from "./actions";
import { Voltar } from "@/components/ui/Voltar";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const GRANS: { v: Granularidade; l: string }[] = [
  { v: "mes", l: "Mês" },
  { v: "trimestre", l: "Trimestre" },
  { v: "semestre", l: "Semestre" },
  { v: "ano", l: "Ano" },
];

export function MetricasFunil({ oportunidades, hoje }: { oportunidades: OportunidadeView[]; hoje: string }) {
  const [gran, setGran] = useState<Granularidade>("mes");
  const [offset, setOffset] = useState(0);
  const { inicio, fim, rotulo } = periodoBounds(gran, hoje, offset);
  const m = metricasFunil(oportunidades, inicio, fim);
  const pct = `${Math.round(m.periodo.taxaConversao * 100)}%`;

  return (
    <div className="space-y-5">
      <Voltar href="/comercial" label="Funil" />

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Pipeline atual</h2>
        <div className="rounded-2xl border border-linha bg-white p-4">
          <p className="text-sm text-cinza">
            Em aberto: <span className="font-medium text-texto tabular-nums">{m.pipeline.total.qtd}</span> ·{" "}
            <span className="font-medium text-texto tabular-nums">{brl(m.pipeline.total.total)}</span>
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ETAPAS_ATIVAS.map((e) => (
              <div key={e.chave} className="rounded-lg bg-creme px-2 py-1.5">
                <div className="text-[11px] uppercase tracking-wide text-cinza">{e.rotulo}</div>
                <div className="text-sm text-texto tabular-nums">
                  {m.pipeline.porEtapa[e.chave]!.qtd} · {brl(m.pipeline.porEtapa[e.chave]!.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-texto">Fechamentos</h2>
          <select
            value={gran}
            onChange={(e) => {
              setGran(e.target.value as Granularidade);
              setOffset(0);
            }}
            className="rounded-lg border border-linha px-2 py-1 text-sm"
          >
            {GRANS.map((g) => (
              <option key={g.v} value={g.v}>
                {g.l}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => setOffset((o) => o - 1)} className="rounded border border-linha px-2">
              ←
            </button>
            <span className="min-w-[9rem] text-center text-texto">{rotulo}</span>
            <button type="button" onClick={() => setOffset((o) => o + 1)} className="rounded border border-linha px-2">
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-linha bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cinza">Ganhos</div>
            <div className="font-display text-lg text-verde tabular-nums">{m.periodo.ganhos.qtd}</div>
            <div className="text-xs text-cinza tabular-nums">{brl(m.periodo.ganhos.valor)}</div>
          </div>
          <div className="rounded-2xl border border-linha bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cinza">Perdidos</div>
            <div className="font-display text-lg text-negativo tabular-nums">{m.periodo.perdidos.qtd}</div>
            <div className="text-xs text-cinza tabular-nums">{brl(m.periodo.perdidos.valor)}</div>
          </div>
          <div className="rounded-2xl border border-linha bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cinza">Taxa de conversão</div>
            <div className="font-display text-lg text-texto tabular-nums">{pct}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Responsável</th>
                <th className="px-3 py-2 text-right font-medium">Ganhos</th>
                <th className="px-3 py-2 text-right font-medium">Perdidos</th>
                <th className="px-3 py-2 text-right font-medium">R$ ganho</th>
              </tr>
            </thead>
            <tbody>
              {m.periodo.porResponsavel.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-cinza">
                    Sem fechamentos no período.
                  </td>
                </tr>
              )}
              {m.periodo.porResponsavel.map((r) => (
                <tr key={r.nome} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">{r.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.ganhos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.perdidos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(r.valorGanho)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-linha bg-white p-3">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-texto">Motivos de perda</h3>
          {m.periodo.motivosPerda.length === 0 ? (
            <p className="mt-1 text-xs text-cinza">Nenhum.</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm">
              {m.periodo.motivosPerda.map((mo) => (
                <li key={mo.motivo} className="flex justify-between">
                  <span className="text-texto">{mo.motivo}</span>
                  <span className="tabular-nums text-cinza">{mo.qtd}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
