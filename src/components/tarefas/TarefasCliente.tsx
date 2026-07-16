"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarTarefa, type TarefaView } from "@/app/(app)/tarefas/actions";
import { TAREFA_STATUS, TAREFA_PRIORIDADE } from "@/lib/tarefas/tarefa";

const rotStatus = (s: string) => TAREFA_STATUS.find((x) => x.valor === s)?.rotulo ?? s;
const rotPrio = (p: string) => TAREFA_PRIORIDADE.find((x) => x.valor === p)?.rotulo ?? p;
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function TarefasCliente({ clienteId, tarefas }: { clienteId: string; tarefas: TarefaView[] }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function nova() {
    if (!titulo.trim()) return;
    setOcupado(true);
    const r = await criarTarefa({
      titulo,
      descricao: null,
      responsavelId: null,
      clienteId,
      departamento: null,
      prioridade: "media",
      prazo: null,
    });
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setTitulo("");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-linha bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Tarefas</h2>
        <Link href={`/tarefas?cliente=${clienteId}`} className="text-xs text-verde underline">
          ver todas
        </Link>
      </div>
      {tarefas.length === 0 ? (
        <p className="mt-1 text-sm text-cinza">Nenhuma tarefa para este cliente.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {tarefas.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-linha px-3 py-2 text-sm"
            >
              <Link href={`/tarefas/${t.id}`} className="font-medium text-texto hover:underline">
                {t.titulo}
              </Link>
              <span className="flex items-center gap-3 text-xs text-cinza">
                <span>{t.responsavelNome ?? "—"}</span>
                <span>{rotPrio(t.prioridade)}</span>
                <span>{dataBR(t.prazo)}</span>
                <span>{rotStatus(t.status)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Nova tarefa para este cliente…"
          className="flex-1 rounded-lg border border-linha px-2 py-1.5 text-sm"
        />
        <button
          disabled={ocupado || !titulo.trim()}
          onClick={nova}
          className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          Criar
        </button>
      </div>
    </section>
  );
}
