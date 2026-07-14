"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarData, formatarMoeda } from "@/lib/format";
import { salvarCusto, excluirCusto, type CustoView } from "./actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";

export function FormCustos({
  custos,
  colaboradores,
  hoje,
}: {
  custos: CustoView[];
  colaboradores: { id: string; nome: string }[];
  hoje: string;
}) {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState("");
  const [custoHora, setCustoHora] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    setOcupado(true);
    setErro(null);
    const r = await salvarCusto({
      usuarioId,
      custoHora: Number(custoHora.replace(",", ".")),
      vigenciaInicio: inicio,
    });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setCustoHora("");
    router.refresh();
  }

  async function excluir(id: string) {
    setOcupado(true);
    const r = await excluirCusto(id);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h2 className="font-display text-sm font-semibold text-texto">Nova vigência</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-cinza">
            Colaborador
            <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={`mt-0.5 block ${cls}`}>
              <option value="">— escolher —</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-cinza">
            Custo por hora (R$)
            <input value={custoHora} onChange={(e) => setCustoHora(e.target.value)} placeholder="65,00" className={`mt-0.5 block w-28 ${cls}`} />
          </label>
          <label className="text-xs text-cinza">
            Vigente a partir de
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={`mt-0.5 block ${cls}`} />
          </label>
          <button disabled={ocupado || !usuarioId || !custoHora} onClick={salvar} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
            Salvar
          </button>
        </div>
        <p className="text-xs text-cinza-claro">
          A nova vigência <strong>fecha a anterior</strong> automaticamente. O relatório sempre usa o custo
          <strong> vigente na data do apontamento</strong> — um aumento não reescreve a rentabilidade passada.
        </p>
        {erro && <p role="alert" className="text-xs text-negativo">{erro}</p>}
      </section>

      {custos.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum custo cadastrado. Sem isso, o custo de atendimento sai zerado.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Colaborador</th>
                <th className="px-3 py-2 text-left font-medium">Custo/hora</th>
                <th className="px-3 py-2 text-left font-medium">Vigência</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {custos.map((c) => (
                <tr key={c.id} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">{c.usuarioNome}</td>
                  <td className="px-3 py-2 text-texto">{formatarMoeda(c.custoHora)}</td>
                  <td className="px-3 py-2 text-cinza">
                    {formatarData(c.vigenciaInicio)} → {c.vigenciaFim ? formatarData(c.vigenciaFim) : "atual"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button disabled={ocupado} onClick={() => excluir(c.id)} className="text-xs text-negativo underline disabled:opacity-60">
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
