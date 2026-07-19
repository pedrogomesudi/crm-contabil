import Link from "next/link";
import { formatarData } from "@/lib/format";
import { competenciaRotulo } from "@/lib/documentos/taxonomia";
import { BotaoBaixar } from "./BotaoBaixar";
import { BotaoExpurgar } from "./BotaoExpurgar";
import type { DocVencido } from "@/app/(app)/documentos/actions";

export function TabelaRetencao({ docs }: { docs: DocVencido[] }) {
  if (docs.length === 0) return <p className="text-sm text-cinza-claro">Nenhum documento vencido.</p>;
  return (
    <div className="overflow-hidden rounded border border-linha">
      <table className="w-full text-sm">
        <thead className="bg-creme text-left text-cinza">
          <tr>
            <th className="p-2 font-medium">Nome</th>
            <th className="p-2 font-medium">Cliente</th>
            <th className="p-2 font-medium">Tipo</th>
            <th className="p-2 font-medium">Competência</th>
            <th className="p-2 font-medium">Vence em</th>
            <th className="p-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t border-linha/70">
              <td className="p-2 text-texto">{d.nome}</td>
              <td className="p-2">
                <Link href={`/clientes/${d.clienteId}?aba=documentos`} className="underline">
                  {d.clienteNome}
                </Link>
              </td>
              <td className="p-2 text-cinza">{d.tipo ?? "—"}</td>
              <td className="p-2 text-cinza">{competenciaRotulo(d.competencia)}</td>
              <td className="p-2 text-negativo">
                <time dateTime={d.venceEm}>{formatarData(d.venceEm)}</time>
              </td>
              <td className="p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <BotaoBaixar documentoId={d.id} nome={d.nome} />
                  <BotaoExpurgar documentoId={d.id} clienteId={d.clienteId} nome={d.nome} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
