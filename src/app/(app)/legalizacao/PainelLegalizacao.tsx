import Link from "next/link";
import { LEGALIZACAO_ORGAOS, type LegOrgao } from "@/lib/legalizacao/tipos";
import { controleCls } from "@/components/ui/Campo";

type Linha = {
  id: string;
  cliente: string;
  titulo: string;
  status: string;
  pct: number;
  proximoPrazo: string | null;
  orgaosPendentes: LegOrgao[];
};
const ROT: Record<string, string> = { em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function PainelLegalizacao({
  linhas,
  filtros,
}: {
  linhas: Linha[];
  filtros: { status: string; orgao: string };
}) {
  return (
    <div className="space-y-4">
      <form
        method="GET"
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-linha bg-white p-3 text-sm"
      >
        <label className="text-xs text-cinza">
          Status
          <select name="status" defaultValue={filtros.status} className={`${controleCls("compacto")} mt-0.5 block`}>
            <option value="em_andamento">Em andamento</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="text-xs text-cinza">
          Órgão pendente
          <select name="orgao" defaultValue={filtros.orgao} className={`${controleCls("compacto")} mt-0.5 block`}>
            <option value="">Qualquer</option>
            {LEGALIZACAO_ORGAOS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-verde px-3 py-1.5 text-white">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-left font-medium">Processo</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              <th className="px-3 py-2 text-left font-medium">Próximo prazo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-cinza">
                  Nenhum processo para os filtros.
                </td>
              </tr>
            ) : (
              linhas.map((l) => (
                <tr key={l.id} className="border-b border-linha/60 hover:bg-creme">
                  <td className="px-3 py-2">
                    <Link href={`/legalizacao/${l.id}`} className="text-verde underline">
                      {l.cliente}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{l.titulo}</td>
                  <td className="px-3 py-2">{ROT[l.status] ?? l.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.pct}%</td>
                  <td className="px-3 py-2 tabular-nums">{dataBR(l.proximoPrazo)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
