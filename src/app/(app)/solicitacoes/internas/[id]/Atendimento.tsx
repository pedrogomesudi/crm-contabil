"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SOLIC_INTERNA_STATUS, type SolicInternaStatus } from "@/lib/solicitacoes/interna";
import {
  assumir,
  responderInterna,
  definirStatusInterna,
  definirResponsavelInterno,
  converterEmTarefaInterna,
} from "../actions";

type Msg = { id: string; corpo: string; criadoEm: string; autor: string; minha: boolean };
type Colab = { id: string; nome: string };

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";
const quando = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;

export function Atendimento({
  id,
  status,
  responsavelId,
  tarefaId,
  colaboradores,
  mensagens,
}: {
  id: string;
  status: SolicInternaStatus;
  responsavelId: string;
  tarefaId: string | null;
  colaboradores: Colab[];
  mensagens: Msg[];
}) {
  const router = useRouter();
  const [corpo, setCorpo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const executar = (fn: () => Promise<{ erro?: string }>) =>
    iniciar(async () => {
      setErro(null);
      const r = await fn();
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-linha bg-white p-3 text-sm">
        {!responsavelId && (
          <button
            disabled={pendente}
            onClick={() => executar(async () => assumir(id))}
            className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
          >
            Assumir
          </button>
        )}

        <label className="text-xs text-cinza">
          Status
          <select
            value={status}
            disabled={pendente}
            onChange={(e) => executar(() => definirStatusInterna(id, e.target.value as SolicInternaStatus))}
            className={`mt-0.5 block ${cls}`}
          >
            {SOLIC_INTERNA_STATUS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select>
        </label>

        <label className="text-xs text-cinza">
          Responsável
          <select
            value={responsavelId}
            disabled={pendente}
            onChange={(e) => executar(() => definirResponsavelInterno(id, e.target.value || null))}
            className={`mt-0.5 block ${cls}`}
          >
            <option value="">— na fila —</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>

        <div className="ml-auto text-xs">
          {tarefaId ? (
            <Link href={`/tarefas/${tarefaId}`} className="text-verde underline">Ver tarefa vinculada</Link>
          ) : (
            <button
              disabled={pendente}
              onClick={() => executar(async () => converterEmTarefaInterna(id))}
              className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60"
            >
              Converter em tarefa
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {mensagens.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl p-3 text-sm ${m.minha ? "ml-auto bg-verde/15" : "border border-linha bg-white"}`}
          >
            <p className="whitespace-pre-wrap text-texto">{m.corpo}</p>
            <p className="mt-1 text-xs text-cinza">{m.autor} · {quando(m.criadoEm)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <textarea
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          rows={3}
          placeholder="Responder…"
          className="flex-1 rounded-lg border border-linha px-2 py-1.5 text-sm"
        />
        <button
          disabled={pendente || !corpo.trim()}
          onClick={() =>
            executar(async () => {
              const r = await responderInterna(id, corpo);
              if (!r.erro) setCorpo("");
              return r;
            })
          }
          className="self-start rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          Enviar
        </button>
      </div>
      {erro && <p role="alert" className="text-xs text-negativo">{erro}</p>}
    </div>
  );
}
