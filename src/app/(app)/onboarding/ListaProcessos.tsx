"use client";
import Link from "next/link";
import type { ResumoProcesso } from "./processos-actions";

const PERFIL_LABEL: Record<string, string> = {
  mei: "MEI",
  simples_sem_func: "Simples s/ func",
  simples_com_func: "Simples c/ func",
  presumido_real: "Presumido/Real",
  pf: "PF",
};

export function ListaProcessos({ itens, hoje }: { itens: ResumoProcesso[]; hoje: string }) {
  if (itens.length === 0) return <p className="text-sm text-cinza">Nenhum onboarding em andamento.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-xs text-cinza">
            <th className="px-3 py-2 text-left font-medium">Cliente</th>
            <th className="px-3 py-2 text-left font-medium">Perfil</th>
            <th className="px-3 py-2 text-left font-medium">Progresso</th>
            <th className="px-3 py-2 text-right font-medium">Próximo prazo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((o) => {
            const atrasado = !!o.proximoPrazo && o.proximoPrazo < hoje;
            return (
              <tr key={o.processoId} className="border-b border-linha/60">
                <td className="px-3 py-2">
                  <Link
                    href={`/onboarding/${o.clienteId}`}
                    className="text-texto underline decoration-linha hover:decoration-verde"
                  >
                    {o.razaoSocial}
                  </Link>
                </td>
                <td className="px-3 py-2 text-cinza">{PERFIL_LABEL[o.perfil] ?? o.perfil}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-linha">
                      <div
                        className={`h-full rounded-full ${o.concluido ? "bg-verde" : "bg-verde/60"}`}
                        style={{ width: `${o.pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-cinza">{o.pct}%</span>
                  </div>
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${atrasado ? "font-semibold text-negativo" : ""}`}>
                  {o.proximoPrazo ? `${o.proximoPrazo.slice(8, 10)}/${o.proximoPrazo.slice(5, 7)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
