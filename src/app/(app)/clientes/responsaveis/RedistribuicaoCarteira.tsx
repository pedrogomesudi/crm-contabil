"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { atribuirEmMassa } from "./actions";
import type { Departamento } from "@/lib/clientes/departamentos";

type ClienteLinha = { id: string; razaoSocial: string; cpfCnpj: string; responsavelId: string | null };
type Colab = { id: string; nome: string };
type Dep = { valor: Departamento; rotulo: string };

export function RedistribuicaoCarteira({ clientes, colaboradores, departamentos, filtros }: {
  clientes: ClienteLinha[];
  colaboradores: Colab[];
  departamentos: Dep[];
  filtros: { depto: Departamento; resp: string; q: string };
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [deptoAlvo, setDeptoAlvo] = useState<Departamento>(filtros.depto);
  const [destino, setDestino] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const nome = (id: string | null) => colaboradores.find((c) => c.id === id)?.nome ?? "—";

  function alterna(id: string) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSel(n);
  }
  function marcarTodos(marcar: boolean) {
    setSel(marcar ? new Set(clientes.map((c) => c.id)) : new Set());
  }
  async function aplicar() {
    if (sel.size === 0) return alert("Selecione ao menos um cliente.");
    setOcupado(true);
    const r = await atribuirEmMassa([...sel], deptoAlvo, destino || null);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setSel(new Set());
    router.refresh();
    alert(`${r.n} cliente(s) atualizado(s).`);
  }

  return (
    <div className="space-y-4">
      <form method="GET" className="flex flex-wrap items-end gap-2 rounded-2xl border border-linha bg-white p-3 text-sm">
        <label className="text-xs text-cinza">Departamento
          <select name="depto" defaultValue={filtros.depto} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
            {departamentos.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs text-cinza">Responsável atual
          <select name="resp" defaultValue={filtros.resp} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
            <option value="">Qualquer</option>
            <option value="nenhum">Sem responsável</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="flex-1 text-xs text-cinza">Busca (razão social)
          <input name="q" defaultValue={filtros.q} className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
        <button className="rounded-lg bg-verde px-3 py-1.5 text-white">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left">
                <input type="checkbox" aria-label="Marcar todos" checked={sel.size > 0 && sel.size === clientes.length} onChange={(e) => marcarTodos(e.target.checked)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-left font-medium">CPF/CNPJ</th>
              <th className="px-3 py-2 text-left font-medium">Responsável atual</th>
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-cinza">Nenhum cliente para os filtros.</td></tr>
            ) : clientes.map((c) => (
              <tr key={c.id} className="border-b border-linha/60">
                <td className="px-3 py-2"><input type="checkbox" checked={sel.has(c.id)} onChange={() => alterna(c.id)} aria-label={`Selecionar ${c.razaoSocial}`} /></td>
                <td className="px-3 py-2">{c.razaoSocial}</td>
                <td className="px-3 py-2 tabular-nums">{c.cpfCnpj}</td>
                <td className="px-3 py-2">{nome(c.responsavelId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-linha bg-creme p-3 text-sm">
        <span className="text-xs text-cinza">{sel.size} selecionado(s)</span>
        <label className="text-xs text-cinza">Departamento-alvo
          <select value={deptoAlvo} onChange={(e) => setDeptoAlvo(e.target.value as Departamento)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
            {departamentos.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs text-cinza">Destino
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm">
            <option value="">— remover responsável</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <button disabled={ocupado || sel.size === 0} onClick={aplicar} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
          {ocupado ? "Aplicando…" : "Aplicar aos selecionados"}
        </button>
      </div>
    </div>
  );
}
