"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarProposta, excluirProposta, type PropostaResumo } from "../propostas-actions";
import { Botao } from "@/components/ui/Botao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ROTULO: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
};

export function PropostasLista({
  oportunidadeId,
  prospectNome,
  propostas,
}: {
  oportunidadeId: string;
  prospectNome: string;
  propostas: PropostaResumo[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function nova() {
    setOcupado(true);
    const r = await criarProposta(oportunidadeId);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    if (r.id) router.push(`/comercial/propostas/${r.id}`);
  }
  async function excluir(id: string) {
    if (!confirm("Excluir esta proposta?")) return;
    setOcupado(true);
    const r = await excluirProposta(id);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Link href="/comercial" className="text-sm text-verde underline">
        ← Funil
      </Link>
      <div className="flex items-center justify-between">
        <p className="text-sm text-cinza">
          Prospect: <span className="font-medium text-texto">{prospectNome}</span>
        </p>
        <Botao variante="primario" disabled={ocupado} onClick={nova}>
          Nova proposta
        </Botao>
      </div>
      {propostas.length === 0 ? (
        <p className="text-sm text-cinza">Nenhuma proposta ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Nº</th>
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
                  <td className="px-3 py-2">{ROTULO[p.status]}</td>
                  <td className="px-3 py-2">
                    {p.validade
                      ? `${p.validade.slice(8, 10)}/${p.validade.slice(5, 7)}/${p.validade.slice(0, 4)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(p.totalMensal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(p.totalUnico)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/comercial/propostas/${p.id}`} className="mr-3 text-xs text-verde underline">
                      abrir
                    </Link>
                    <button type="button" onClick={() => excluir(p.id)} className="text-xs text-negativo underline">
                      excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
