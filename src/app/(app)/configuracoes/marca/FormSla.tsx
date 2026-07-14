"use client";
import { useActionState } from "react";
import type { EstadoMarca } from "./actions";
import { salvarSla } from "./portal-actions";

export function FormSla({ dias }: { dias: number }) {
  const [estado, acao, pendente] = useActionState<EstadoMarca, FormData>(salvarSla, {});

  return (
    <form action={acao} className="space-y-3 rounded-2xl border border-linha bg-white p-4">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Portal do cliente</h2>
        <p className="text-xs text-cinza">Prazo-alvo para responder às solicitações abertas pelo cliente no portal.</p>
      </div>
      <label className="block text-xs text-cinza">
        SLA de solicitações (dias)
        <input
          name="solicitacao_sla_dias"
          type="number"
          min={0}
          max={60}
          defaultValue={dias}
          className="mt-0.5 block w-28 rounded-lg border border-linha px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pendente} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60">
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        {estado.ok && <span className="text-xs text-verde">Salvo.</span>}
        {estado.erro && <span role="alert" className="text-xs text-negativo">{estado.erro}</span>}
      </div>
    </form>
  );
}
