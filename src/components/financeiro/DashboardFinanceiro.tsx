"use client";
import { useState, useTransition } from "react";
import { CardResumo } from "@/components/CardResumo";
import { formatarMoeda } from "@/lib/format";
import { LABEL_FAIXA, type FaixaAging } from "@/lib/financeiro/relatorios";
import { carregarDashboard, type DadosDashboard } from "@/app/(app)/financeiro/dashboard/actions";

const FAIXAS: FaixaAging[] = ["a_vencer", "d1_30", "d31_60", "d61_90", "d90_mais"];

function Barra({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="h-3 w-full rounded bg-slate-100">
      <div className="h-3 rounded bg-slate-800" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DashboardFinanceiro({ mesInicial, dadosIniciais }: { mesInicial: string; dadosIniciais: DadosDashboard }) {
  const [mes, setMes] = useState(mesInicial);
  const [dados, setDados] = useState(dadosIniciais);
  const [pend, start] = useTransition();

  const trocar = (novo: string) => {
    setMes(novo);
    start(async () => {
      const d = await carregarDashboard(`${novo}-01`);
      if (d) setDados(d);
    });
  };

  const r = dados.resumo;
  const maxAging = Math.max(1, ...FAIXAS.map((f) => dados.aging[f]?.total ?? 0));
  const maxAgingP = Math.max(1, ...FAIXAS.map((f) => dados.agingPagar[f]?.total ?? 0));
  const maxFluxo = Math.max(1, ...dados.fluxo.map((m) => Math.max(m.realizado, m.a_receber)));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <label className="text-sm">
          Competência
          <input type="month" value={mes} onChange={(e) => trocar(e.target.value)} className="ml-2 rounded border border-slate-300 px-2 py-1" />
        </label>
        {pend && <span className="text-xs text-slate-500">atualizando…</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <CardResumo titulo="Saldo real" valor={formatarMoeda(r.saldo_real)} />
        <CardResumo titulo="MRR (recorrente)" valor={formatarMoeda(r.mrr)} />
        <CardResumo titulo="Recebido no mês" valor={formatarMoeda(r.recebido_mes)} />
        <CardResumo titulo="Saídas no mês" valor={formatarMoeda(r.saidas_mes)} />
        <CardResumo titulo="A receber no mês" valor={formatarMoeda(r.a_receber_mes)} />
        <CardResumo titulo="A pagar no mês" valor={formatarMoeda(r.a_pagar_mes)} />
        <CardResumo titulo="Inadimplência" valor={`${formatarMoeda(r.inadimplencia_total)} · ${r.inadimplencia_pct}%`} />
        <CardResumo titulo="Previsão 30 dias" valor={formatarMoeda(r.previsao_30)} />
        <CardResumo titulo="Previsão 60 dias" valor={formatarMoeda(r.previsao_60)} />
        <CardResumo titulo="Previsão 90 dias" valor={formatarMoeda(r.previsao_90)} />
        <CardResumo titulo="Receita do mês" valor={formatarMoeda(r.receita_despesa?.receita ?? 0)} />
        <CardResumo titulo="Despesa do mês" valor={formatarMoeda(r.receita_despesa?.despesa ?? 0)} />
      </div>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Aging de contas a receber</h2>
        {FAIXAS.map((f) => {
          const item = dados.aging[f] ?? { total: 0, qtd: 0 };
          return (
            <div key={f} className="grid grid-cols-[8rem_1fr_8rem] items-center gap-2 text-sm">
              <span>{LABEL_FAIXA[f]}</span>
              <Barra valor={item.total} max={maxAging} />
              <span className="text-right">
                {formatarMoeda(item.total)} ({item.qtd})
              </span>
            </div>
          );
        })}
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Aging de contas a pagar</h2>
        {FAIXAS.map((f) => {
          const item = dados.agingPagar[f] ?? { total: 0, qtd: 0 };
          return (
            <div key={f} className="grid grid-cols-[8rem_1fr_8rem] items-center gap-2 text-sm">
              <span>{LABEL_FAIXA[f]}</span>
              <Barra valor={item.total} max={maxAgingP} />
              <span className="text-right">
                {formatarMoeda(item.total)} ({item.qtd})
              </span>
            </div>
          );
        })}
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Fluxo de caixa (6 meses)</h2>
        {dados.fluxo.map((m) => (
          <div key={m.mes} className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2 text-sm">
            <span>{m.mes}</span>
            <span className="flex items-center gap-2">
              <span className="w-16 text-xs text-green-700">recebido</span>
              <Barra valor={m.realizado} max={maxFluxo} />
              <span className="w-24 text-right">{formatarMoeda(m.realizado)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-16 text-xs text-slate-500">a receber</span>
              <Barra valor={m.a_receber} max={maxFluxo} />
              <span className="w-24 text-right">{formatarMoeda(m.a_receber)}</span>
            </span>
          </div>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Maiores devedores</h2>
          <table className="w-full text-sm">
            <tbody>
              {dados.devedores.map((d) => (
                <tr key={d.cliente} className="border-t border-slate-100">
                  <td className="py-1">{d.cliente}</td>
                  <td className="py-1 text-right">
                    {formatarMoeda(d.total)} ({d.qtd})
                  </td>
                </tr>
              ))}
              {dados.devedores.length === 0 && (
                <tr>
                  <td className="py-1 text-slate-400">Nenhum vencido.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Receita por tipo (competência)</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="py-1">Mensalidade</td>
                <td className="py-1 text-right">{formatarMoeda(r.receita_por_tipo.MENSALIDADE ?? 0)}</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1">13º</td>
                <td className="py-1 text-right">{formatarMoeda(r.receita_por_tipo.DECIMO_TERCEIRO ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
