"use client";
import { useState } from "react";
import { controleCls } from "@/components/ui/Campo";
import { StatCard } from "@/components/ui/StatCard";
import { REGIMES } from "@/lib/tipos";
import { calcularHonorario, type ConfigPreco, type Parametros, type ServicoView } from "@/lib/comercial/precificacao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Calculadora({
  config,
  complexidades,
  servicos,
  onUsar,
  inicial,
}: {
  config: ConfigPreco;
  complexidades: { id: string; nome: string }[];
  servicos: ServicoView[];
  onUsar?: (params: Parametros, servicos: ServicoView[]) => void;
  inicial?: Parametros;
}) {
  const [regime, setRegime] = useState<string>(inicial?.regime ?? REGIMES[0]);
  const [faturamento, setFaturamento] = useState(inicial?.faturamento ?? 0);
  const [funcionarios, setFuncionarios] = useState(inicial?.funcionarios ?? 0);
  const [notas, setNotas] = useState(inicial?.notas ?? 0);
  const [complexidadeId, setComplexidadeId] = useState<string | null>(inicial?.complexidadeId ?? null);
  const [servicoIds, setServicoIds] = useState<string[]>(inicial?.servicoIds ?? []);
  const [descontoPct, setDescontoPct] = useState(inicial?.descontoPct ?? 0);

  const r = calcularHonorario(
    { regime, faturamento, funcionarios, notas, complexidadeId, servicoIds, descontoPct },
    config,
  );

  const num = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setter(Number.isFinite(v) ? v : 0);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Formulário */}
      <div className="space-y-3 rounded-2xl border border-linha bg-white p-4">
        <label className="block text-xs text-cinza">
          Regime
          <select
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
            className={`${controleCls("compacto")} mt-0.5 w-full`}
          >
            {REGIMES.map((reg) => (
              <option key={reg} value={reg}>
                {reg}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-cinza">
          Faturamento (R$/mês)
          <input
            type="number"
            min={0}
            value={faturamento}
            onChange={num(setFaturamento)}
            className={`${controleCls("compacto")} mt-0.5 w-full`}
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-cinza">
            Funcionários
            <input
              type="number"
              min={0}
              value={funcionarios}
              onChange={num(setFuncionarios)}
              className={`${controleCls("compacto")} mt-0.5 w-full`}
            />
          </label>
          <label className="flex-1 text-xs text-cinza">
            Notas/mês
            <input
              type="number"
              min={0}
              value={notas}
              onChange={num(setNotas)}
              className={`${controleCls("compacto")} mt-0.5 w-full`}
            />
          </label>
        </div>

        <label className="block text-xs text-cinza">
          Complexidade
          <select
            value={complexidadeId ?? ""}
            onChange={(e) => setComplexidadeId(e.target.value || null)}
            className={`${controleCls("compacto")} mt-0.5 w-full`}
          >
            <option value="">—</option>
            {complexidades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>

        {servicos.length > 0 && (
          <div className="text-xs text-cinza">
            Serviços adicionais
            <div className="mt-1 space-y-1">
              {servicos.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={servicoIds.includes(s.id)}
                    onChange={(e) =>
                      setServicoIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id)))
                    }
                  />
                  <span className="text-texto">{s.nome}</span>
                  <span className="tabular-nums text-cinza">
                    {brl(s.valor)}
                    {s.recorrencia === "mensal" ? "/mês" : " único"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="block text-xs text-cinza">
          Desconto (%) — máx {config.descontoMaximoPct}%
          <input
            type="number"
            min={0}
            max={100}
            value={descontoPct}
            onChange={num(setDescontoPct)}
            className={`${controleCls("compacto")} mt-0.5 w-full`}
          />
        </label>
      </div>

      {/* Resultado */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <StatCard rotulo="Mensal" valor={brl(r.mensal)} variante="positivo" />
          <StatCard rotulo="Único" valor={brl(r.unico)} />
        </div>
        <div className="rounded-2xl border border-linha bg-white p-4">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-texto">Detalhamento</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {r.detalhamento.map((linha, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="text-cinza">{linha.rotulo}</span>
                <span className={`tabular-nums ${linha.valor < 0 ? "text-negativo" : "text-texto"}`}>
                  {brl(linha.valor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {onUsar && (
          <button
            type="button"
            onClick={() =>
              onUsar({ regime, faturamento, funcionarios, notas, complexidadeId, servicoIds, descontoPct }, servicos)
            }
            className="w-full rounded-lg bg-verde px-3 py-2 text-sm font-medium text-white"
          >
            Usar na proposta
          </button>
        )}
      </div>
    </div>
  );
}
