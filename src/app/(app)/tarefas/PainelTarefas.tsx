"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarTarefa, definirStatusTarefa, type TarefaView } from "./actions";
import { TAREFA_STATUS, TAREFA_PRIORIDADE, type TarefaStatus } from "@/lib/tarefas/tarefa";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";
import { classificarAlerta } from "@/lib/onboarding/alertas";
import { Calendario } from "./Calendario";

type Colab = { id: string; nome: string };
const rotStatus = (s: string) => TAREFA_STATUS.find((x) => x.valor === s)?.rotulo ?? s;
const rotPrio = (p: string) => TAREFA_PRIORIDADE.find((x) => x.valor === p)?.rotulo ?? p;
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const SEV: Record<string, string> = {
  em_breve: "text-atencao",
  vencido: "text-negativo",
  critico: "text-negativo font-semibold",
};
const PRIO_COR: Record<string, string> = {
  urgente: "bg-negativo/15 text-negativo",
  alta: "bg-atencao-fundo text-atencao",
  media: "bg-linha text-cinza",
  baixa: "bg-linha text-cinza",
};
const KANBAN: TarefaStatus[] = ["aberta", "em_andamento", "concluida"];

export function PainelTarefas({
  tarefas,
  colaboradores,
  filtros,
  vista,
  hoje,
  ano,
  mes,
}: {
  tarefas: TarefaView[];
  colaboradores: Colab[];
  filtros: { responsavel?: string; cliente?: string; departamento?: string; status?: string; prioridade?: string };
  vista: "lista" | "kanban" | "calendario";
  hoje: string;
  ano: number;
  mes: number;
}) {
  const router = useRouter();
  // Preserva os filtros ao trocar de vista ou de mês — senão o calendário "perde" o filtro aplicado.
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...filtros, vista, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/tarefas?${q}` : "/tarefas";
  };
  const [titulo, setTitulo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function nova() {
    if (!titulo.trim()) return;
    setOcupado(true);
    const r = await criarTarefa({
      titulo,
      descricao: null,
      responsavelId: null,
      clienteId: filtros.cliente ?? null,
      departamento: null,
      prioridade: "media",
      prazo: null,
    });
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    if (r.id) router.push(`/tarefas/${r.id}`);
  }
  async function mover(id: string, status: TarefaStatus) {
    setOcupado(true);
    const r = await definirStatusTarefa(id, status);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }
  const nomeColab = (id: string | null) => (id ? (colaboradores.find((c) => c.id === id)?.nome ?? "—") : "—");

  return (
    <div className="space-y-4">
      <form
        method="GET"
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-linha bg-white p-3 text-sm"
      >
        <label className="text-xs text-cinza">
          Responsável
          <select
            name="responsavel"
            defaultValue={filtros.responsavel ?? ""}
            className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cinza">
          Departamento
          <select
            name="departamento"
            defaultValue={filtros.departamento ?? ""}
            className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {DEPARTAMENTOS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cinza">
          Status
          <select
            name="status"
            defaultValue={filtros.status ?? ""}
            className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {TAREFA_STATUS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cinza">
          Prioridade
          <select
            name="prioridade"
            defaultValue={filtros.prioridade ?? ""}
            className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {TAREFA_PRIORIDADE.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="vista" value={vista} />
        <button className="rounded-lg bg-verde px-3 py-1.5 text-white">Filtrar</button>
        <span className="ml-auto flex gap-1">
          <Link
            href={link({ vista: "lista" })}
            className={`rounded-lg border px-2 py-1.5 text-xs ${vista === "lista" ? "border-verde text-verde" : "border-linha text-cinza"}`}
          >
            Lista
          </Link>
          <Link
            href={link({ vista: "kanban" })}
            className={`rounded-lg border px-2 py-1.5 text-xs ${vista === "kanban" ? "border-verde text-verde" : "border-linha text-cinza"}`}
          >
            Kanban
          </Link>
          <Link
            href={link({ vista: "calendario" })}
            className={`rounded-lg border px-2 py-1.5 text-xs ${vista === "calendario" ? "border-verde text-verde" : "border-linha text-cinza"}`}
          >
            Calendário
          </Link>
          <Link href="/tarefas/recorrencias" className="rounded-lg border border-linha px-2 py-1.5 text-xs text-cinza">
            Recorrentes
          </Link>
        </span>
      </form>

      <div className="flex gap-2">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Nova tarefa…"
          className="flex-1 rounded-lg border border-linha px-3 py-2 text-sm"
        />
        <button
          disabled={ocupado || !titulo.trim()}
          onClick={nova}
          className="rounded-lg bg-verde px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          Criar
        </button>
      </div>

      {vista === "calendario" ? (
        <Calendario tarefas={tarefas} ano={ano} mes={mes} hoje={hoje} link={link} />
      ) : vista === "lista" ? (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Tarefa</th>
                <th className="px-3 py-2 text-left font-medium">Responsável</th>
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Prazo</th>
                <th className="px-3 py-2 text-left font-medium">Prioridade</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tarefas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-cinza">
                    Nenhuma tarefa.
                  </td>
                </tr>
              ) : (
                tarefas.map((t) => {
                  const sev = t.status !== "concluida" && t.prazo ? classificarAlerta(t.prazo, hoje) : null;
                  return (
                    <tr key={t.id} className="border-b border-linha/60 hover:bg-creme">
                      <td className="px-3 py-2">
                        <Link href={`/tarefas/${t.id}`} className="text-verde underline">
                          {t.titulo}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-cinza">{t.responsavelNome ?? "—"}</td>
                      <td className="px-3 py-2 text-cinza">{t.clienteNome ?? "—"}</td>
                      <td className={`px-3 py-2 ${sev ? SEV[sev] : "text-cinza"}`}>{dataBR(t.prazo)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${PRIO_COR[t.prioridade]}`}>
                          {rotPrio(t.prioridade)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-cinza">{rotStatus(t.status)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {KANBAN.map((col) => (
            <div key={col} className="rounded-2xl border border-linha bg-creme p-2">
              <h3 className="px-1 py-1 text-xs font-semibold text-cinza">{rotStatus(col)}</h3>
              <div className="space-y-2">
                {tarefas
                  .filter((t) => t.status === col)
                  .map((t) => {
                    const sev = col !== "concluida" && t.prazo ? classificarAlerta(t.prazo, hoje) : null;
                    const idx = KANBAN.indexOf(col);
                    return (
                      <div key={t.id} className="rounded-lg border border-linha bg-white p-2 text-sm">
                        <Link href={`/tarefas/${t.id}`} className="font-medium text-texto hover:underline">
                          {t.titulo}
                        </Link>
                        <div className="mt-1 flex items-center justify-between text-xs text-cinza">
                          <span>{nomeColab(t.responsavelId)}</span>
                          <span className={sev ? SEV[sev] : ""}>{dataBR(t.prazo)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${PRIO_COR[t.prioridade]}`}>
                            {rotPrio(t.prioridade)}
                          </span>
                          <span className="flex gap-1">
                            {idx > 0 && (
                              <button
                                disabled={ocupado}
                                onClick={() => mover(t.id, KANBAN[idx - 1]!)}
                                className="px-1 text-cinza"
                                aria-label="Voltar status"
                              >
                                ←
                              </button>
                            )}
                            {idx < KANBAN.length - 1 && (
                              <button
                                disabled={ocupado}
                                onClick={() => mover(t.id, KANBAN[idx + 1]!)}
                                className="px-1 text-verde"
                                aria-label="Avançar status"
                              >
                                →
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
