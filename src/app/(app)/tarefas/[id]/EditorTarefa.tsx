"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarTarefa, definirStatusTarefa, excluirTarefa, salvarItem, alternarItem, excluirItem } from "../actions";
import { TAREFA_STATUS, TAREFA_PRIORIDADE, type TarefaStatus, type TarefaPrioridade } from "@/lib/tarefas/tarefa";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";
type Item = { id: string; descricao: string; feito: boolean };
type Tarefa = { id: string; titulo: string; descricao: string; responsavelId: string; clienteId: string; departamento: string; prioridade: TarefaPrioridade; prazo: string; status: TarefaStatus; itens: Item[] };

export function EditorTarefa({ tarefa, colaboradores, clientes }: { tarefa: Tarefa; colaboradores: { id: string; nome: string }[]; clientes: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [descricao, setDescricao] = useState(tarefa.descricao);
  const [responsavel, setResponsavel] = useState(tarefa.responsavelId);
  const [cliente, setCliente] = useState(tarefa.clienteId);
  const [departamento, setDepartamento] = useState(tarefa.departamento);
  const [prioridade, setPrioridade] = useState<TarefaPrioridade>(tarefa.prioridade);
  const [prazo, setPrazo] = useState(tarefa.prazo);
  const [status, setStatus] = useState<TarefaStatus>(tarefa.status);
  const [novoItem, setNovoItem] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function run(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }
  async function salvar() {
    await run(() => salvarTarefa(tarefa.id, { titulo, descricao: descricao || null, responsavelId: responsavel || null, clienteId: cliente || null, departamento: (departamento || null) as Departamento | null, prioridade, prazo: prazo || null }));
  }
  async function mudarStatus(s: TarefaStatus) {
    setStatus(s);
    await run(() => definirStatusTarefa(tarefa.id, s));
  }
  async function excluir() {
    if (!confirm("Excluir esta tarefa?")) return;
    setOcupado(true);
    const r = await excluirTarefa(tarefa.id);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.push("/tarefas");
  }
  async function addItem() {
    if (!novoItem.trim()) return;
    await run(() => salvarItem({ tarefaId: tarefa.id, descricao: novoItem }));
    setNovoItem("");
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`w-full ${cls}`} placeholder="Título" />
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className={`w-full ${cls}`} placeholder="Descrição" />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-cinza">Responsável
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={`mt-0.5 block w-full ${cls}`}>
              <option value="">—</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-cinza">Cliente
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={`mt-0.5 block w-full ${cls}`}>
              <option value="">—</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-cinza">Departamento
            <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={`mt-0.5 block w-full ${cls}`}>
              <option value="">—</option>
              {DEPARTAMENTOS.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
            </select>
          </label>
          <label className="text-xs text-cinza">Prioridade
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as TarefaPrioridade)} className={`mt-0.5 block w-full ${cls}`}>
              {TAREFA_PRIORIDADE.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </label>
          <label className="text-xs text-cinza">Prazo
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={`mt-0.5 block w-full ${cls}`} />
          </label>
          <label className="text-xs text-cinza">Status
            <select value={status} onChange={(e) => mudarStatus(e.target.value as TarefaStatus)} className={`mt-0.5 block w-full ${cls}`}>
              {TAREFA_STATUS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button disabled={ocupado} onClick={salvar} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">Salvar</button>
          <button disabled={ocupado} onClick={excluir} className="text-xs text-negativo underline">Excluir tarefa</button>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h3 className="font-display text-sm font-semibold text-texto">Checklist</h3>
        {tarefa.itens.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input type="checkbox" checked={it.feito} onChange={(e) => run(() => alternarItem(it.id, e.target.checked))} />
            <span className={`flex-1 ${it.feito ? "text-cinza line-through" : "text-texto"}`}>{it.descricao}</span>
            <button onClick={() => run(() => excluirItem(it.id))} className="text-xs text-negativo underline">remover</button>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={novoItem} onChange={(e) => setNovoItem(e.target.value)} placeholder="Novo item…" className={`flex-1 ${cls}`} />
          <button disabled={ocupado || !novoItem.trim()} onClick={addItem} className="rounded-lg border border-linha px-3 py-1.5 disabled:opacity-60">+ item</button>
        </div>
      </section>
    </div>
  );
}
