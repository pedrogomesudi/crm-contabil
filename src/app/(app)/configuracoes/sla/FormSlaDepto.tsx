"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";
import { salvarSlaDepartamento } from "./actions";

export function FormSlaDepto({ slas }: { slas: Record<string, number> }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, number>>(slas);
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();

  const salvar = (d: Departamento) =>
    iniciar(async () => {
      const r = await salvarSlaDepartamento(d, valores[d] ?? 3);
      setMsg(r.erro ?? "SLA salvo.");
      router.refresh();
    });

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-4 text-sm">
      <p className="text-xs text-cinza">
        O prazo é aplicado <strong>no momento em que a solicitação é aberta</strong>. Mudar o SLA aqui não
        reescreve o prazo das solicitações já abertas.
      </p>
      {DEPARTAMENTOS.map((d) => (
        <div key={d.valor} className="flex flex-wrap items-center gap-2">
          <span className="w-48 text-texto">{d.rotulo}</span>
          <input
            type="number"
            min={0}
            max={60}
            value={valores[d.valor] ?? 3}
            onChange={(e) => setValores((v) => ({ ...v, [d.valor]: Number(e.target.value) }))}
            className="w-20 rounded-lg border border-linha px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-cinza">dia(s)</span>
          <button
            disabled={pend}
            onClick={() => salvar(d.valor)}
            className="rounded-lg border border-linha px-3 py-1.5 text-xs text-cinza disabled:opacity-60"
          >
            Salvar
          </button>
        </div>
      ))}
      {msg && <p className="text-xs text-verde">{msg}</p>}
    </div>
  );
}
