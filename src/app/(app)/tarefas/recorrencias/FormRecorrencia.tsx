"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERIODICIDADES, rotuloRegra, type Periodicidade } from "@/lib/tarefas/recorrencia";
import { TAREFA_PRIORIDADE, type TarefaPrioridade } from "@/lib/tarefas/tarefa";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";
import { formatarData } from "@/lib/format";
import {
  salvarRecorrencia,
  excluirRecorrencia,
  gerarAgora,
  type RecorrenciaView,
} from "./actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type Colab = { id: string; nome: string };
type Cli = { id: string; nome: string };

const vazia = (hoje: string): RecorrenciaView => ({
  id: "",
  titulo: "",
  descricao: null,
  responsavelId: null,
  clienteId: null,
  clienteNome: null,
  departamento: null,
  prioridade: "media",
  periodicidade: "mensal",
  diaSemana: null,
  diaMes: 5,
  mes: null,
  antecedenciaDias: 3,
  proximaData: hoje,
  ativa: true,
  itens: [],
});

export function FormRecorrencia({
  recorrencias,
  colaboradores,
  clientes,
  hoje,
  editavel,
}: {
  recorrencias: RecorrenciaView[];
  colaboradores: Colab[];
  clientes: Cli[];
  hoje: string;
  editavel: boolean;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<RecorrenciaView | null>(null);
  const [checklist, setChecklist] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function abrir(r: RecorrenciaView | null) {
    const base = r ?? vazia(hoje);
    setEdit(base);
    setChecklist(base.itens.join("\n"));
    setMsg(null);
  }

  const mudar = (campo: keyof RecorrenciaView, valor: unknown) =>
    setEdit((e) => (e ? { ...e, [campo]: valor } : e));

  async function salvar() {
    if (!edit) return;
    setOcupado(true);
    const r = await salvarRecorrencia({
      id: edit.id || undefined,
      titulo: edit.titulo,
      descricao: edit.descricao,
      responsavelId: edit.responsavelId,
      clienteId: edit.clienteId,
      departamento: edit.departamento,
      prioridade: edit.prioridade,
      periodicidade: edit.periodicidade,
      diaSemana: edit.diaSemana,
      diaMes: edit.diaMes,
      mes: edit.mes,
      antecedenciaDias: edit.antecedenciaDias,
      proximaData: edit.proximaData,
      ativa: edit.ativa,
      itens: checklist.split("\n"),
    });
    setOcupado(false);
    if (r.erro) return setMsg(r.erro);
    setEdit(null);
    router.refresh();
  }

  async function excluir(id: string) {
    setOcupado(true);
    const r = await excluirRecorrencia(id);
    setOcupado(false);
    if (r.erro) return setMsg(r.erro);
    router.refresh();
  }

  async function gerar() {
    setOcupado(true);
    const r = await gerarAgora();
    setOcupado(false);
    if (r.erro) return setMsg(r.erro);
    const s = r.resumo;
    setMsg(
      s
        ? `Recorrências ${s.recorrencias}, criadas ${s.criadas}, já existentes ${s.puladas}` +
          (s.limitadas > 0 ? `, ${s.limitadas} atingiram o teto de 24 por execução` : "") +
          (s.erros > 0 ? `, erros ${s.erros}` : "") +
          "."
        : "",
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {editavel && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => abrir(null)} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white">
            Nova recorrência
          </button>
          <button
            onClick={gerar}
            disabled={ocupado}
            className="rounded-lg border border-linha px-3 py-1.5 text-sm text-cinza disabled:opacity-60"
            title="Gera agora as ocorrências que já entraram na janela de antecedência"
          >
            Gerar agora
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-cinza">{msg}</p>}

      {recorrencias.length === 0 ? (
        <p className="text-sm text-cinza">Nenhuma tarefa recorrente ainda.</p>
      ) : (
        <ul className="space-y-2">
          {recorrencias.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-3 text-sm"
            >
              <span>
                <span className="font-medium text-texto">{r.titulo}</span>
                {!r.ativa && <span className="ml-2 text-xs text-cinza">(inativa)</span>}
                <span className="block text-xs text-cinza">
                  {rotuloRegra(r)} · próxima em {formatarData(r.proximaData)}
                  {r.clienteNome && ` · ${r.clienteNome}`}
                  {r.itens.length > 0 && ` · ${r.itens.length} item(ns) de checklist`}
                </span>
              </span>
              {editavel && (
                <span className="flex gap-3 text-xs">
                  <button onClick={() => abrir(r)} className="text-verde underline">editar</button>
                  <button disabled={ocupado} onClick={() => excluir(r.id)} className="text-negativo underline disabled:opacity-60">
                    excluir
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {edit && (
        <div className="space-y-3 rounded-2xl border border-linha bg-white p-4 text-sm">
          <h2 className="font-display text-sm font-semibold text-texto">
            {edit.id ? "Editar recorrência" : "Nova recorrência"}
          </h2>

          <div className="flex flex-wrap gap-2">
            <label className="flex-1 text-xs text-cinza">
              Título
              <input value={edit.titulo} onChange={(e) => mudar("titulo", e.target.value)} className={`mt-0.5 block w-full ${cls}`} />
            </label>
            <label className="text-xs text-cinza">
              Prioridade
              <select value={edit.prioridade} onChange={(e) => mudar("prioridade", e.target.value as TarefaPrioridade)} className={`mt-0.5 block ${cls}`}>
                {TAREFA_PRIORIDADE.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-xs text-cinza">
            Descrição
            <textarea value={edit.descricao ?? ""} onChange={(e) => mudar("descricao", e.target.value || null)} rows={2} className={`mt-0.5 block w-full ${cls}`} />
          </label>

          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-cinza">
              Cliente
              <select value={edit.clienteId ?? ""} onChange={(e) => mudar("clienteId", e.target.value || null)} className={`mt-0.5 block ${cls}`}>
                <option value="">— interna —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="text-xs text-cinza">
              Departamento
              <select value={edit.departamento ?? ""} onChange={(e) => mudar("departamento", (e.target.value || null) as Departamento | null)} className={`mt-0.5 block ${cls}`}>
                <option value="">—</option>
                {DEPARTAMENTOS.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
              </select>
            </label>
            <label className="text-xs text-cinza">
              Responsável
              <select value={edit.responsavelId ?? ""} onChange={(e) => mudar("responsavelId", e.target.value || null)} className={`mt-0.5 block ${cls}`}>
                <option value="">— sem responsável —</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-cinza">
              Periodicidade
              <select value={edit.periodicidade} onChange={(e) => mudar("periodicidade", e.target.value as Periodicidade)} className={`mt-0.5 block ${cls}`}>
                {PERIODICIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </label>

            {edit.periodicidade === "semanal" ? (
              <label className="text-xs text-cinza">
                Dia da semana
                <select value={edit.diaSemana ?? 1} onChange={(e) => mudar("diaSemana", Number(e.target.value))} className={`mt-0.5 block ${cls}`}>
                  {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
            ) : (
              <label className="text-xs text-cinza">
                Dia do mês
                <input type="number" min={1} max={31} value={edit.diaMes ?? 1} onChange={(e) => mudar("diaMes", Number(e.target.value))} className={`mt-0.5 block w-20 ${cls}`} />
                <span className="mt-0.5 block text-[11px] text-cinza-claro">31 em mês curto cai no último dia.</span>
              </label>
            )}

            {edit.periodicidade === "anual" && (
              <label className="text-xs text-cinza">
                Mês
                <input type="number" min={1} max={12} value={edit.mes ?? 1} onChange={(e) => mudar("mes", Number(e.target.value))} className={`mt-0.5 block w-20 ${cls}`} />
              </label>
            )}

            <label className="text-xs text-cinza">
              Antecedência (dias)
              <input type="number" min={0} max={60} value={edit.antecedenciaDias} onChange={(e) => mudar("antecedenciaDias", Number(e.target.value))} className={`mt-0.5 block w-24 ${cls}`} />
              <span className="mt-0.5 block text-[11px] text-cinza-claro">Quantos dias antes do prazo a tarefa nasce.</span>
            </label>

            <label className="text-xs text-cinza">
              Próxima ocorrência
              <input type="date" value={edit.proximaData} onChange={(e) => mudar("proximaData", e.target.value)} className={`mt-0.5 block ${cls}`} />
            </label>

            <label className="mt-5 flex items-center gap-1.5 text-xs text-cinza">
              <input type="checkbox" checked={edit.ativa} onChange={(e) => mudar("ativa", e.target.checked)} /> Ativa
            </label>
          </div>

          <label className="block text-xs text-cinza">
            Checklist-modelo (um item por linha)
            <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} rows={4} className={`mt-0.5 block w-full ${cls}`} />
          </label>

          <div className="flex items-center gap-3">
            <button disabled={ocupado} onClick={salvar} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
              {ocupado ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => setEdit(null)} className="text-xs text-cinza underline">cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
