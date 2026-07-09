"use client";
import { useState } from "react";
import { listarInstancias, gerarCompetenciaCliente, type InstanciaView } from "@/app/(app)/obrigacoes/actions";
import { AcoesInstancia } from "@/app/(app)/obrigacoes/AcoesInstancia";
import { GerarRetroativo } from "@/app/(app)/obrigacoes/GerarRetroativo";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function ObrigacoesCliente({ clienteId, ano, mes, instancias: iniList, podeGerar }: { clienteId: string; ano: number; mes: number; instancias: InstanciaView[]; podeGerar: boolean }) {
  const [lista, setLista] = useState<InstanciaView[]>(iniList);
  const [carregando, setCarregando] = useState(false);
  async function recarregar() {
    setLista(await listarInstancias(ano, mes, { clienteId }));
  }
  async function gerar() {
    setCarregando(true);
    await gerarCompetenciaCliente(clienteId, ano, mes);
    await recarregar();
    setCarregando(false);
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-texto">Obrigações da competência</h2>
        {podeGerar && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={gerar} className="rounded-lg border border-linha px-3 py-1.5 text-sm">Gerar para este cliente</button>
            <GerarRetroativo clienteId={clienteId} anoAtual={ano} onDone={recarregar} />
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Obrigação</th>
              <th className="px-3 py-2 font-medium">Interno</th>
              <th className="px-3 py-2 font-medium">Legal</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-cinza">{carregando ? "Carregando…" : "Sem obrigações nesta competência."}</td>
              </tr>
            )}
            {lista.map((r) => (
              <tr key={r.id} className="border-b border-linha/60">
                <td className="px-3 py-1.5 text-texto">{r.obrigacaoNome}</td>
                <td className="px-3 py-1.5">{dataBR(r.vencimentoInterno)}</td>
                <td className="px-3 py-1.5">{dataBR(r.vencimentoLegal)}</td>
                <td className="px-3 py-1.5"><AcoesInstancia inst={r} onDone={recarregar} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
