"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/format";
import { iniciarProcessoSop, type ModeloOpcao, type ProcessoView } from "@/app/(app)/tarefas/sop-actions";

const cls = controleCls("compacto");

const ROTULO_STATUS: Record<ProcessoView["status"], string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export function ProcessosSop({
  clienteId,
  modelos,
  processos,
  hoje,
  mostrarCliente = false,
}: {
  clienteId: string | null;
  modelos: ModeloOpcao[];
  processos: ProcessoView[];
  hoje: string;
  mostrarCliente?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [dataInicio, setDataInicio] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function iniciar() {
    setOcupado(true);
    setErro(null);
    const r = await iniciarProcessoSop({ templateId, clienteId, dataInicio });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setAberto(false);
    setTemplateId("");
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linha bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Processos</h2>
        {modelos.length > 0 && !aberto && (
          <button onClick={() => setAberto(true)} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white">
            Iniciar processo
          </button>
        )}
      </div>

      {modelos.length === 0 && (
        <p className="text-sm text-cinza">
          Nenhum modelo de processo ativo. Crie um em{" "}
          <Link href="/configuracoes/sop" className="text-verde underline">
            Configurações → Modelos de processo
          </Link>
          .
        </p>
      )}

      {aberto && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-linha p-3 text-sm">
          <label className="text-xs text-cinza">
            Modelo
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className={`mt-0.5 block ${cls}`}
            >
              <option value="">— escolher —</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-cinza">
            Início
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className={`mt-0.5 block ${cls}`}
            />
          </label>
          <button
            disabled={ocupado || !templateId}
            onClick={iniciar}
            className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
          >
            {ocupado ? "Iniciando…" : "Iniciar"}
          </button>
          <button type="button" onClick={() => setAberto(false)} className="text-xs text-cinza underline">
            cancelar
          </button>
          {erro && (
            <span role="alert" className="text-xs text-negativo">
              {erro}
            </span>
          )}
        </div>
      )}

      {processos.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum processo iniciado.</p>
      ) : (
        <ul className="space-y-2">
          {processos.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-linha pb-2 text-sm last:border-0"
            >
              <span>
                <span className="font-medium text-texto">{p.templateNome}</span>
                <span className="block text-xs text-cinza">
                  {mostrarCliente && `${p.clienteNome ?? "Interno"} · `}
                  início {formatarData(p.dataInicio)} · onda {p.ondaAtual} · {ROTULO_STATUS[p.status]}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-cinza">
                  {p.feitas}/{p.total} ({p.pct}%)
                </span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-linha">
                  <span className="block h-full rounded-full bg-verde" style={{ width: `${p.pct}%` }} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
