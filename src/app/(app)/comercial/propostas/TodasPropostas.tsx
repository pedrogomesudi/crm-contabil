import Link from "next/link";
import type { PropostaGlobal } from "../propostas-actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ROTULO: Record<string, string> = { rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", recusada: "Recusada" };
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function TodasPropostas({ propostas }: { propostas: PropostaGlobal[] }) {
  if (propostas.length === 0) return <p className="text-sm text-cinza">Nenhuma proposta ainda. Crie uma a partir de uma oportunidade no <Link href="/comercial" className="text-verde underline">funil</Link>.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-xs text-cinza">
            <th className="px-3 py-2 text-left font-medium">Nº</th>
            <th className="px-3 py-2 text-left font-medium">Prospect</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Validade</th>
            <th className="px-3 py-2 text-right font-medium">Mensal</th>
            <th className="px-3 py-2 text-right font-medium">Único</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {propostas.map((p) => (
            <tr key={p.id} className="border-b border-linha/60">
              <td className="px-3 py-2 tabular-nums">{p.numero}</td>
              <td className="px-3 py-2">{p.prospectNome}</td>
              <td className="px-3 py-2">{ROTULO[p.status]}</td>
              <td className="px-3 py-2">{dataBR(p.validade)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{brl(p.totalMensal)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{brl(p.totalUnico)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <Link href={`/comercial/propostas/${p.id}`} className="mr-3 text-xs text-verde underline">abrir</Link>
                <Link href={`/comercial/propostas?op=${p.oportunidadeId}`} className="text-xs text-cinza underline">da oportunidade</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
