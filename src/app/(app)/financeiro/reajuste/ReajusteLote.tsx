"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { simularReajuste, aplicarReajusteLote } from "./actions";
import type { LinhaReajuste } from "@/lib/reajuste/simulacao";
import { formatarMoeda } from "@/lib/format";

const ROTULO: Record<string, string> = {
  SALARIO_MINIMO: "Salário mínimo",
  IPCA: "IPCA",
  IGPM: "IGP-M",
  INPC: "INPC",
  PERCENTUAL_FIXO: "% fixo",
};

export function ReajusteLote() {
  const [ano, setAno] = useState("");
  const [linhas, setLinhas] = useState<LinhaReajuste[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [feito, setFeito] = useState<number | null>(null);

  async function simular() {
    const anoNum = Number(ano);
    if (!anoNum) return;
    setCarregando(true);
    setFeito(null);
    const r = await simularReajuste(anoNum);
    setCarregando(false);
    if (r.erro) {
      setAviso(r.erro);
      return;
    }
    setLinhas(r.linhas ?? []);
    setAviso(r.avisoBacen ?? null);
  }

  function editar(id: string, patch: Partial<LinhaReajuste>) {
    setLinhas((ls) => ls.map((l) => (l.clienteId === id ? { ...l, ...patch } : l)));
  }

  async function aplicar() {
    setAplicando(true);
    const r = await aplicarReajusteLote(Number(ano), linhas);
    setAplicando(false);
    if (r.erro) {
      setAviso(r.erro);
      return;
    }
    setFeito(r.aplicados ?? 0);
    setLinhas([]);
  }

  const marcadas = linhas.filter((l) => l.marcada);
  const totalNovo = marcadas.reduce((s, l) => s + l.valorNovo, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-cinza">
          Ano-base
          <input
            value={ano}
            onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="2027"
            className={`${controleCls()} ml-2 w-24`}
          />
        </label>
        <button
          onClick={simular}
          disabled={carregando || ano.length !== 4}
          className="rounded-lg border border-linha bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          {carregando ? "Simulando…" : "Simular"}
        </button>
      </div>

      {aviso && <p className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">{aviso}</p>}
      {feito != null && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{feito} honorário(s) reajustado(s).</p>
      )}

      {linhas.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-linha bg-white">
            <table className="w-full text-sm">
              <thead className="bg-creme text-left text-cinza">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2 font-medium">Cliente</th>
                  <th className="p-2 font-medium">Índice</th>
                  <th className="p-2 text-right font-medium">%</th>
                  <th className="p-2 text-right font-medium">Atual</th>
                  <th className="p-2 text-right font-medium">Novo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.clienteId} className="border-t border-linha">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={l.marcada}
                        onChange={(e) => editar(l.clienteId, { marcada: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 text-texto">{l.nome}</td>
                    <td className="p-2 text-cinza">{ROTULO[l.indice] ?? l.indice}</td>
                    <td className="p-2 text-right">
                      <input
                        value={String(l.percentual)}
                        onChange={(e) => {
                          const pct = Number(e.target.value.replace(",", ".")) || 0;
                          editar(l.clienteId, {
                            percentual: pct,
                            valorNovo: Math.round(l.valorAtual * (1 + pct / 100) * 100) / 100,
                          });
                        }}
                        className={`w-20 rounded border px-1 py-0.5 text-right ${l.percentual < 0 ? "border-negativo text-negativo" : "border-linha"}`}
                      />
                    </td>
                    <td className="p-2 text-right tabular-nums text-cinza">{formatarMoeda(l.valorAtual)}</td>
                    <td className="p-2 text-right tabular-nums">{formatarMoeda(l.valorNovo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-cinza">
              {marcadas.length} marcados · novo total {formatarMoeda(totalNovo)}
            </span>
            <button
              onClick={aplicar}
              disabled={aplicando || marcadas.length === 0}
              className="rounded-lg bg-verde px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {aplicando ? "Aplicando…" : `Aplicar ${marcadas.length}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
