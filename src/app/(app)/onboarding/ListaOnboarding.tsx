"use client";
import Link from "next/link";
import type { OnboardingResumo } from "./actions";

export function ListaOnboarding({ itens }: { itens: OnboardingResumo[] }) {
  if (itens.length === 0) return <p className="text-sm text-cinza">Nenhum cliente em onboarding ainda.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-xs text-cinza">
            <th className="px-3 py-2 text-left font-medium">Cliente</th>
            <th className="px-3 py-2 text-left font-medium">Progresso</th>
            <th className="px-3 py-2 text-right font-medium">Obrig. pendentes</th>
            <th className="px-3 py-2 text-right font-medium">Próximo prazo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((o) => (
            <tr key={o.clienteId} className="border-b border-linha/60">
              <td className="px-3 py-2">
                <Link href={`/clientes/${o.clienteId}`} className="text-texto underline decoration-linha hover:decoration-verde">
                  {o.razaoSocial}
                </Link>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-linha">
                    <div className={`h-full rounded-full ${o.concluido ? "bg-verde" : "bg-verde/60"}`} style={{ width: `${o.pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-cinza">{o.pct}%</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{o.total - o.concluidos > 0 ? o.total - o.concluidos : 0}</td>
              <td className="px-3 py-2 text-right tabular-nums">{o.proximoPrazo ? `${o.proximoPrazo.slice(8, 10)}/${o.proximoPrazo.slice(5, 7)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
