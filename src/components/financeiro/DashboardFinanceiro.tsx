"use client";
import { useState, useTransition } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { formatarMoeda } from "@/lib/format";
import { LABEL_FAIXA, type FaixaAging } from "@/lib/financeiro/relatorios";
import { carregarDashboard, type DadosDashboard } from "@/app/(app)/financeiro/dashboard/actions";

const FAIXAS: FaixaAging[] = ["a_vencer", "d1_30", "d31_60", "d61_90", "d90_mais"];

function Barra({ valor, max, cor = "bg-verde" }: { valor: number; max: number; cor?: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="h-2.5 w-full rounded-full bg-creme">
      <div className={`h-2.5 rounded-full ${cor}`} style={{ width: `${pct}%` }} />
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
        <label className="text-sm text-cinza">
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => trocar(e.target.value)}
            className="ml-2 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto focus:border-verde"
          />
        </label>
        {pend && <span className="text-xs text-cinza-claro">atualizando…</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard rotulo="Saldo real" valor={formatarMoeda(r.saldo_real)} variante="positivo" />
        <StatCard rotulo="MRR (recorrente)" valor={formatarMoeda(r.mrr)} variante="positivo" />
        <StatCard rotulo="Recebido no mês" valor={formatarMoeda(r.recebido_mes)} variante="positivo" />
        <StatCard rotulo="Saídas no mês" valor={formatarMoeda(r.saidas_mes)} variante="negativo" />
        <StatCard rotulo="A receber no mês" valor={formatarMoeda(r.a_receber_mes)} />
        <StatCard rotulo="A pagar no mês" valor={formatarMoeda(r.a_pagar_mes)} />
        <StatCard
          rotulo="Inadimplência"
          valor={`${formatarMoeda(r.inadimplencia_total)} · ${r.inadimplencia_pct}%`}
          variante={r.inadimplencia_total > 0 ? "negativo" : "neutro"}
        />
        <StatCard rotulo="Previsão 30 dias" valor={formatarMoeda(r.previsao_30)} variante="destaque" />
        <StatCard rotulo="Previsão 60 dias" valor={formatarMoeda(r.previsao_60)} variante="destaque" />
        <StatCard rotulo="Previsão 90 dias" valor={formatarMoeda(r.previsao_90)} variante="destaque" />
        <StatCard rotulo="Receita do mês" valor={formatarMoeda(r.receita_despesa?.receita ?? 0)} variante="positivo" />
        <StatCard rotulo="Despesa do mês" valor={formatarMoeda(r.receita_despesa?.despesa ?? 0)} variante="negativo" />
      </div>

      <Card className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Aging de contas a receber</h2>
        {FAIXAS.map((f) => {
          const item = dados.aging[f] ?? { total: 0, qtd: 0 };
          return (
            <div key={f} className="grid grid-cols-[8rem_1fr_9rem] items-center gap-2 text-sm">
              <span className="text-cinza">{LABEL_FAIXA[f]}</span>
              <Barra valor={item.total} max={maxAging} cor={f === "d90_mais" ? "bg-negativo/70" : "bg-verde"} />
              <span className="text-right font-mono text-xs tabular-nums text-texto">
                {formatarMoeda(item.total)} <span className="text-cinza-claro">({item.qtd})</span>
              </span>
            </div>
          );
        })}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Aging de contas a pagar</h2>
        {FAIXAS.map((f) => {
          const item = dados.agingPagar[f] ?? { total: 0, qtd: 0 };
          return (
            <div key={f} className="grid grid-cols-[8rem_1fr_9rem] items-center gap-2 text-sm">
              <span className="text-cinza">{LABEL_FAIXA[f]}</span>
              <Barra valor={item.total} max={maxAgingP} cor={f === "d90_mais" ? "bg-negativo/70" : "bg-linha"} />
              <span className="text-right font-mono text-xs tabular-nums text-texto">
                {formatarMoeda(item.total)} <span className="text-cinza-claro">({item.qtd})</span>
              </span>
            </div>
          );
        })}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Fluxo de caixa (6 meses)</h2>
        {dados.fluxo.map((m) => (
          <div key={m.mes} className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2 text-sm">
            <span className="font-mono text-xs text-cinza">{m.mes}</span>
            <span className="flex items-center gap-2">
              <span className="w-16 text-xs text-verde">recebido</span>
              <Barra valor={m.realizado} max={maxFluxo} cor="bg-verde" />
              <span className="w-24 text-right font-mono text-xs tabular-nums text-texto">{formatarMoeda(m.realizado)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-16 text-xs text-cinza-claro">a receber</span>
              <Barra valor={m.a_receber} max={maxFluxo} cor="bg-linha" />
              <span className="w-24 text-right font-mono text-xs tabular-nums text-texto">{formatarMoeda(m.a_receber)}</span>
            </span>
          </div>
        ))}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-display text-sm font-semibold text-texto">Maiores devedores</h2>
          <table className="w-full text-sm">
            <tbody>
              {dados.devedores.map((d) => (
                <tr key={d.cliente} className="border-t border-linha/70">
                  <td className="py-1.5 text-texto">{d.cliente}</td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-texto">
                    {formatarMoeda(d.total)} <span className="text-cinza-claro">({d.qtd})</span>
                  </td>
                </tr>
              ))}
              {dados.devedores.length === 0 && (
                <tr>
                  <td className="py-1.5 text-cinza-claro">Nenhum vencido.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-sm font-semibold text-texto">Receita por tipo (competência)</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-linha/70">
                <td className="py-1.5 text-texto">Mensalidade</td>
                <td className="py-1.5 text-right font-mono text-xs tabular-nums text-texto">
                  {formatarMoeda(r.receita_por_tipo.MENSALIDADE ?? 0)}
                </td>
              </tr>
              <tr className="border-t border-linha/70">
                <td className="py-1.5 text-texto">13º</td>
                <td className="py-1.5 text-right font-mono text-xs tabular-nums text-texto">
                  {formatarMoeda(r.receita_por_tipo.DECIMO_TERCEIRO ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
