import Link from "next/link";
import { formatarData } from "@/lib/format";
import { rotuloDepartamento, type Departamento } from "@/lib/clientes/departamentos";
import { competenciaRotulo } from "@/lib/documentos/taxonomia";
import { BotaoBaixar } from "./BotaoBaixar";
import type { DocBusca } from "@/app/(app)/documentos/actions";

export function TabelaResultadosBusca({ docs }: { docs: DocBusca[] }) {
  if (docs.length === 0) return <p className="text-sm text-cinza-claro">Nenhum documento encontrado.</p>;
  return (
    <div className="overflow-hidden rounded border border-linha">
      <table className="w-full text-sm">
        <thead className="bg-creme text-left text-cinza">
          <tr>
            <th className="p-2 font-medium">Nome</th>
            <th className="p-2 font-medium">Cliente</th>
            <th className="p-2 font-medium">Tipo</th>
            <th className="p-2 font-medium">Departamento</th>
            <th className="p-2 font-medium">Competência</th>
            <th className="p-2 font-medium">Enviado em</th>
            <th className="p-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t border-linha/70">
              <td className="p-2 text-texto">
                {d.nome}
                {d.textoStatus === "vazio" && (
                  <span className="block text-xs text-cinza-claro">digitalização — sem texto pesquisável</span>
                )}
              </td>
              <td className="p-2">
                <Link href={`/clientes/${d.clienteId}?aba=documentos`} className="underline">
                  {d.clienteNome}
                </Link>
              </td>
              <td className="p-2 text-cinza">{d.tipo ?? "—"}</td>
              <td className="p-2 text-cinza">
                {d.departamento ? rotuloDepartamento(d.departamento as Departamento) : "—"}
              </td>
              <td className="p-2 text-cinza">{competenciaRotulo(d.competencia)}</td>
              <td className="p-2 text-cinza">
                <time dateTime={d.enviado_em}>{formatarData(d.enviado_em)}</time>
              </td>
              <td className="p-2">
                <BotaoBaixar documentoId={d.id} nome={d.nome} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
