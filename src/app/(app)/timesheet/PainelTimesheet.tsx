"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/format";
import { formatarHoras, parseDuracao } from "@/lib/timesheet/apontamento";
import {
  salvarApontamento,
  excluirApontamento,
  iniciarCronometro,
  pararCronometro,
  type ApontamentoView,
  type SessaoView,
} from "./actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";

type Opcao = { id: string; nome: string };

export function PainelTimesheet({
  apontamentos,
  sessao,
  clientes,
  tarefas,
  colaboradores,
  hoje,
  filtros,
  veDeTodos,
}: {
  apontamentos: ApontamentoView[];
  sessao: SessaoView | null;
  clientes: Opcao[];
  tarefas: Opcao[];
  colaboradores: Opcao[];
  hoje: string;
  filtros: { de: string; ate: string; usuarioId?: string };
  veDeTodos: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(hoje);
  const [duracao, setDuracao] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [tarefaId, setTarefaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<{ minutos: number } | null>(null);
  const [minutosCorrigidos, setMinutosCorrigidos] = useState("");

  const total = apontamentos.reduce((s, a) => s + a.minutos, 0);

  async function apontar() {
    const minutos = parseDuracao(duracao);
    if (minutos === null) return setErro("Duração inválida (use 1h30, 1:30 ou 90).");
    setOcupado(true);
    setErro(null);
    const r = await salvarApontamento({
      data,
      minutos,
      clienteId: clienteId || null,
      tarefaId: tarefaId || null,
      descricao: descricao || null,
    });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setDuracao("");
    setDescricao("");
    router.refresh();
  }

  async function iniciar() {
    setOcupado(true);
    setErro(null);
    const r = await iniciarCronometro({ clienteId: clienteId || null, tarefaId: tarefaId || null });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  async function parar(minutos?: number) {
    setOcupado(true);
    setErro(null);
    const r = await pararCronometro(minutos);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    // Sessão longa: não grava sozinha — pede confirmação com o valor editável.
    if (r.confirmar) {
      setConfirmar(r.confirmar);
      setMinutosCorrigidos(String(r.confirmar.minutos));
      return;
    }
    setConfirmar(null);
    router.refresh();
  }

  async function excluir(id: string) {
    setOcupado(true);
    const r = await excluirApontamento(id);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Cronômetro */}
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h2 className="font-display text-sm font-semibold text-texto">Cronômetro</h2>
        {sessao ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-texto">
              Rodando há <strong>{formatarHoras(sessao.minutos)}</strong>
              {sessao.tarefaTitulo && <span className="text-cinza"> · {sessao.tarefaTitulo}</span>}
            </span>
            <button onClick={() => parar()} disabled={ocupado} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
              Parar e apontar
            </button>
            {sessao.suspeita && (
              <span className="text-xs text-negativo">Sessão longa — vamos confirmar o tempo antes de gravar.</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-cinza">Nenhum cronômetro em andamento.</span>
            <button onClick={iniciar} disabled={ocupado} className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60">
              Iniciar (usa o cliente/tarefa selecionados abaixo)
            </button>
          </div>
        )}

        {confirmar && (
          <div className="space-y-2 rounded-lg bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              O cronômetro ficou <strong>{formatarHoras(confirmar.minutos)}</strong> ligado — provavelmente foi
              esquecido. Confirme ou corrija o tempo antes de gravar.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={minutosCorrigidos}
                onChange={(e) => setMinutosCorrigidos(e.target.value)}
                className={`w-24 ${cls}`}
                title="minutos"
              />
              <button
                onClick={() => parar(Number(minutosCorrigidos))}
                disabled={ocupado || !Number(minutosCorrigidos)}
                className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
              >
                Gravar
              </button>
              <button onClick={() => setConfirmar(null)} className="text-xs text-cinza underline">cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Apontamento manual */}
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h2 className="font-display text-sm font-semibold text-texto">Apontar hora</h2>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-cinza">
            Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`mt-0.5 block ${cls}`} />
          </label>
          <label className="text-xs text-cinza">
            Duração
            <input value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="1h30" className={`mt-0.5 block w-24 ${cls}`} />
          </label>
          <label className="text-xs text-cinza">
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={`mt-0.5 block ${cls}`}>
              <option value="">— interna —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-cinza">
            Tarefa
            <select value={tarefaId} onChange={(e) => setTarefaId(e.target.value)} className={`mt-0.5 block ${cls}`}>
              <option value="">—</option>
              {tarefas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
          <label className="flex-1 text-xs text-cinza">
            O que foi feito
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={`mt-0.5 block w-full ${cls}`} />
          </label>
          <button onClick={apontar} disabled={ocupado || !duracao} className="mt-5 rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
            Apontar
          </button>
        </div>
        <p className="text-xs text-cinza-claro">
          Apontar numa tarefa herda o cliente dela. Sem cliente, a hora é interna (não entra no custo de nenhum
          cliente).
        </p>
        {erro && <p role="alert" className="text-xs text-negativo">{erro}</p>}
      </section>

      {/* Lista */}
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-cinza">
            De
            <input type="date" name="de" defaultValue={filtros.de} className={`mt-0.5 block ${cls}`} />
          </label>
          <label className="text-xs text-cinza">
            Até
            <input type="date" name="ate" defaultValue={filtros.ate} className={`mt-0.5 block ${cls}`} />
          </label>
          {veDeTodos && (
            <label className="text-xs text-cinza">
              Colaborador
              <select name="usuarioId" defaultValue={filtros.usuarioId ?? ""} className={`mt-0.5 block ${cls}`}>
                <option value="">Todos</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
          <button className="rounded-lg border border-linha px-3 py-1.5 text-cinza">Filtrar</button>
          <span className="ml-auto text-sm text-texto">
            Total: <strong>{formatarHoras(total)}</strong>
          </span>
        </form>

        {apontamentos.length === 0 ? (
          <p className="text-sm text-cinza">Nenhum apontamento no período.</p>
        ) : (
          <ul className="divide-y divide-linha">
            {apontamentos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium text-texto">{formatarHoras(a.minutos)}</span>
                  <span className="text-cinza"> · {formatarData(a.data)}</span>
                  {a.clienteId ? (
                    <Link href={`/clientes/${a.clienteId}`} className="ml-1 text-verde underline">{a.clienteNome}</Link>
                  ) : (
                    <span className="ml-1 text-cinza">(interna)</span>
                  )}
                  <span className="block text-xs text-cinza">
                    {veDeTodos && `${a.usuarioNome} · `}
                    {a.tarefaTitulo ? `${a.tarefaTitulo} · ` : ""}
                    {a.descricao ?? "—"}
                    {a.origem === "cronometro" && " · cronômetro"}
                  </span>
                </span>
                <button disabled={ocupado} onClick={() => excluir(a.id)} className="text-xs text-negativo underline disabled:opacity-60">
                  excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
