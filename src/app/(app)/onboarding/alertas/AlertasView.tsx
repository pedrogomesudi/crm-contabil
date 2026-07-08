"use client";
import { useState } from "react";
import Link from "next/link";
import type { AlertaView } from "../alertas-actions";

const SEV = [
  { k: "critico", l: "Crítico (vencido há +7 dias)", cls: "text-negativo" },
  { k: "vencido", l: "Vencido", cls: "text-negativo" },
  { k: "em_breve", l: "Vence em breve", cls: "text-cinza" },
] as const;
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function AlertasView({ alertas }: { alertas: AlertaView[] }) {
  const [soMeus, setSoMeus] = useState(false);
  const lista = soMeus ? alertas.filter((a) => a.meu) : alertas;
  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => setSoMeus(false)} className={!soMeus ? "font-semibold text-verde" : "text-cinza"}>
          Todos
        </button>
        <button type="button" onClick={() => setSoMeus(true)} className={soMeus ? "font-semibold text-verde" : "text-cinza"}>
          Só os meus
        </button>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum alerta de prazo.</p>
      ) : (
        SEV.map((s) => {
          const doGrupo = lista.filter((a) => a.severidade === s.k);
          if (doGrupo.length === 0) return null;
          return (
            <div key={s.k} className="space-y-1.5">
              <h3 className={`font-display text-xs font-semibold uppercase tracking-wide ${s.cls}`}>
                {s.l} ({doGrupo.length})
              </h3>
              {doGrupo.map((a) => (
                <div key={a.itemId} className="rounded-lg border border-linha bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/onboarding/${a.clienteId}`} className="font-medium text-texto underline decoration-linha hover:decoration-verde">
                      {a.razaoSocial}
                    </Link>
                    {a.bloqueante && <span className="rounded bg-negativo/10 px-1.5 text-[10px] text-negativo">bloqueante</span>}
                    <span className={`ml-auto tabular-nums ${s.cls}`}>{dataBR(a.prazo)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-cinza">
                    {a.codigo ? `${a.codigo} · ` : ""}
                    {a.titulo} — {a.blocoNome}
                    {a.responsavelNome ? ` · resp. ${a.responsavelNome}` : ""}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
