"use client";
import { useState } from "react";
import { classificarAlerta } from "@/lib/onboarding/alertas";
import { listarRiscos } from "../actions";
import type { PainelRiscos } from "@/lib/obrigacoes/risco";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const SELO: Record<string, string> = {
  em_breve: "bg-creme text-texto",
  vencido: "bg-negativo/10 text-negativo",
  critico: "bg-negativo text-white",
};

function Card({ titulo, n, cor }: { titulo: string; n: number; cor?: string }) {
  return (
    <div className="rounded-2xl border border-linha bg-white p-4">
      <div className={`text-2xl font-bold ${cor ?? "text-texto"}`}>{n}</div>
      <div className="text-xs text-cinza">{titulo}</div>
    </div>
  );
}

export function PainelRiscosView({ painel: ini, hoje }: { painel: PainelRiscos; hoje: string }) {
  const [painel, setPainel] = useState(ini);
  const [soMeus, setSoMeus] = useState(false);
  async function recarregar(m: boolean) {
    setSoMeus(m);
    setPainel(await listarRiscos({ soMeus: m }));
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Card titulo="Vencendo hoje" n={painel.resumo.vencendoHoje} />
          <Card titulo="Vencidas" n={painel.resumo.vencidas} cor="text-negativo" />
          <Card titulo="Sem responsável" n={painel.resumo.semResponsavel} />
        </div>
        <label className="flex items-center gap-1 text-sm text-cinza">
          <input type="checkbox" checked={soMeus} onChange={(e) => recarregar(e.target.checked)} />
          só os meus
        </label>
      </div>
      {painel.grupos.length === 0 && (
        <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">
          Nenhuma obrigação em aberto.
        </p>
      )}
      {painel.grupos.map((g) => (
        <div key={g.responsavelId ?? "nulo"} className="space-y-1">
          <h3 className={`text-sm font-semibold ${g.responsavelId === null ? "text-negativo" : "text-texto"}`}>
            {g.responsavelNome ?? "Sem responsável"}
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
            <table className="min-w-full text-sm">
              <tbody>
                {g.itens.map((it) => {
                  const sev = classificarAlerta(it.vencimentoInterno, hoje);
                  return (
                    <tr key={it.id} className="border-b border-linha/60">
                      <td className="px-3 py-1.5 text-texto">{it.clienteNome}</td>
                      <td className="px-3 py-1.5">{it.obrigacaoNome}</td>
                      <td className="px-3 py-1.5">{dataBR(it.vencimentoInterno)}</td>
                      <td className="px-3 py-1.5">
                        {sev ? (
                          <span className={`rounded px-1.5 py-0.5 text-xs ${SELO[sev]}`}>{sev.replace("_", " ")}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
