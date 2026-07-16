import type { ItemEscalado } from "../escalonamento-actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const SELO_NIVEL: Record<1 | 2, string> = { 1: "bg-negativo/10 text-negativo", 2: "bg-negativo text-white" };
const ROTULO: Record<1 | 2, string> = { 1: "líder", 2: "sócio" };

export function EscalonamentoView({ itens, ativo }: { itens: ItemEscalado[]; ativo: boolean }) {
  if (!ativo)
    return (
      <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">
        Escalonamento desativado nas configurações.
      </p>
    );
  if (itens.length === 0)
    return (
      <p className="rounded-2xl border border-linha bg-white px-3 py-4 text-sm text-cinza">Nada escalado para você.</p>
    );
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Obrigação</th>
            <th className="px-3 py-2 font-medium">Vencimento</th>
            <th className="px-3 py-2 font-medium">Atraso</th>
            <th className="px-3 py-2 font-medium">Responsável</th>
            <th className="px-3 py-2 font-medium">Nível</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it) => (
            <tr key={it.id} className="border-b border-linha/60">
              <td className="px-3 py-1.5 text-texto">{it.clienteNome}</td>
              <td className="px-3 py-1.5">{it.obrigacaoNome}</td>
              <td className="px-3 py-1.5">{dataBR(it.vencimentoInterno)}</td>
              <td className="px-3 py-1.5 tabular-nums">{it.diasAtraso} dias</td>
              <td className="px-3 py-1.5">{it.responsavelNome ?? "—"}</td>
              <td className="px-3 py-1.5">
                <span className={`rounded px-1.5 py-0.5 text-xs ${SELO_NIVEL[it.nivel]}`}>{ROTULO[it.nivel]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
