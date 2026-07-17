"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PAPEIS_EQUIPE } from "@/lib/tipos";
import type { Papel } from "@/lib/tipos";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";
import { TAREFA_PRIORIDADE, type TarefaPrioridade } from "@/lib/tarefas/tarefa";
import { resumoFluxo, type SopEtapa } from "@/lib/tarefas/sop";
import { salvarTemplateSop, excluirTemplateSop, type SopTemplateView } from "./actions";

const cls = controleCls("compacto");

type EtapaEdit = {
  onda: number;
  titulo: string;
  descricao: string;
  responsavelPapel: string;
  prazoDias: number;
  prioridade: TarefaPrioridade;
  itens: string;
};

const etapaVazia = (onda: number): EtapaEdit => ({
  onda,
  titulo: "",
  descricao: "",
  responsavelPapel: "",
  prazoDias: 0,
  prioridade: "media",
  itens: "",
});

const paraEdit = (e: SopEtapa): EtapaEdit => ({
  onda: e.onda,
  titulo: e.titulo,
  descricao: e.descricao ?? "",
  responsavelPapel: e.responsavelPapel ?? "",
  prazoDias: e.prazoDias,
  prioridade: e.prioridade as TarefaPrioridade,
  itens: e.itens.join("\n"),
});

export function FormSop({ templates }: { templates: SopTemplateView[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [id, setId] = useState<string | undefined>();
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [departamento, setDepartamento] = useState<string>("");
  const [ativo, setAtivo] = useState(true);
  const [etapas, setEtapas] = useState<EtapaEdit[]>([etapaVazia(1)]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function abrir(t: SopTemplateView | null) {
    setId(t?.id);
    setSlug(t?.slug ?? "");
    setNome(t?.nome ?? "");
    setDescricao(t?.descricao ?? "");
    setDepartamento(t?.departamento ?? "");
    setAtivo(t?.ativo ?? true);
    setEtapas(t && t.etapas.length > 0 ? t.etapas.map(paraEdit) : [etapaVazia(1)]);
    setErro(null);
    setAberto(true);
  }

  const mudarEtapa = (i: number, campo: keyof EtapaEdit, valor: unknown) =>
    setEtapas((es) => es.map((e, k) => (k === i ? { ...e, [campo]: valor } : e)));

  const previa = resumoFluxo(
    etapas.map((e, i) => ({
      id: String(i),
      onda: e.onda,
      ordem: i,
      titulo: e.titulo,
      descricao: null,
      responsavelPapel: null,
      prazoDias: e.prazoDias,
      prioridade: e.prioridade,
      itens: [],
    })),
  );

  async function salvar() {
    setOcupado(true);
    setErro(null);
    const r = await salvarTemplateSop({
      id,
      slug: slug || nome,
      nome,
      descricao: descricao || null,
      departamento: (departamento || null) as Departamento | null,
      ativo,
      etapas: etapas.map((e, i) => ({
        onda: e.onda,
        ordem: i,
        titulo: e.titulo,
        descricao: e.descricao || null,
        responsavelPapel: (e.responsavelPapel || null) as Papel | null,
        prazoDias: e.prazoDias,
        prioridade: e.prioridade,
        itens: e.itens.split("\n"),
      })),
    });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setAberto(false);
    router.refresh();
  }

  async function excluir(tid: string) {
    setOcupado(true);
    const r = await excluirTemplateSop(tid);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">Modelos de processo</h2>
        <button onClick={() => abrir(null)} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white">
          Novo modelo
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum modelo ainda.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-3 text-sm"
            >
              <span>
                <span className="font-medium text-texto">{t.nome}</span>
                {!t.ativo && <span className="ml-2 text-xs text-cinza">(inativo)</span>}
                <span className="block text-xs text-cinza">{resumoFluxo(t.etapas)}</span>
              </span>
              <span className="flex gap-3 text-xs">
                <button onClick={() => abrir(t)} className="text-verde underline">
                  editar
                </button>
                <button
                  disabled={ocupado}
                  onClick={() => excluir(t.id)}
                  className="text-negativo underline disabled:opacity-60"
                >
                  excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {aberto && (
        <div className="space-y-3 rounded-2xl border border-linha bg-white p-4 text-sm">
          <h3 className="font-display text-sm font-semibold text-texto">{id ? "Editar modelo" : "Novo modelo"}</h3>

          <div className="flex flex-wrap gap-2">
            <label className="flex-1 text-xs text-cinza">
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={`mt-0.5 block w-full ${cls}`} />
            </label>
            <label className="text-xs text-cinza">
              Identificador
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="abertura-empresa"
                className={`mt-0.5 block w-48 ${cls}`}
              />
            </label>
            <label className="text-xs text-cinza">
              Departamento
              <select
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                className={`mt-0.5 block ${cls}`}
              >
                <option value="">—</option>
                {DEPARTAMENTOS.map((d) => (
                  <option key={d.valor} value={d.valor}>
                    {d.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-5 flex items-center gap-1.5 text-xs text-cinza">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
            </label>
          </div>

          <label className="block text-xs text-cinza">
            Descrição
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={`mt-0.5 block w-full ${cls}`}
            />
          </label>

          <div className="rounded-lg bg-creme p-2 text-xs text-cinza">
            <strong>Fluxo:</strong> {previa}
            <span className="mt-0.5 block text-cinza-claro">
              Etapas na mesma onda nascem juntas (paralelas). A onda seguinte só nasce quando todas as tarefas da
              anterior forem concluídas.
            </span>
          </div>

          <div className="space-y-2">
            {etapas.map((e, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-linha p-2">
                <div className="flex flex-wrap gap-2">
                  <label className="text-xs text-cinza">
                    Onda
                    <input
                      type="number"
                      min={1}
                      value={e.onda}
                      onChange={(ev) => mudarEtapa(i, "onda", Number(ev.target.value))}
                      className={`mt-0.5 block w-16 ${cls}`}
                    />
                  </label>
                  <label className="flex-1 text-xs text-cinza">
                    Etapa
                    <input
                      value={e.titulo}
                      onChange={(ev) => mudarEtapa(i, "titulo", ev.target.value)}
                      className={`mt-0.5 block w-full ${cls}`}
                    />
                  </label>
                  <label className="text-xs text-cinza">
                    Prazo (dias)
                    <input
                      type="number"
                      min={0}
                      value={e.prazoDias}
                      onChange={(ev) => mudarEtapa(i, "prazoDias", Number(ev.target.value))}
                      className={`mt-0.5 block w-24 ${cls}`}
                      title="dias após o início do processo"
                    />
                  </label>
                  <label className="text-xs text-cinza">
                    Responsável (papel)
                    <select
                      value={e.responsavelPapel}
                      onChange={(ev) => mudarEtapa(i, "responsavelPapel", ev.target.value)}
                      className={`mt-0.5 block ${cls}`}
                    >
                      <option value="">—</option>
                      {PAPEIS_EQUIPE.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-cinza">
                    Prioridade
                    <select
                      value={e.prioridade}
                      onChange={(ev) => mudarEtapa(i, "prioridade", ev.target.value as TarefaPrioridade)}
                      className={`mt-0.5 block ${cls}`}
                    >
                      {TAREFA_PRIORIDADE.map((p) => (
                        <option key={p.valor} value={p.valor}>
                          {p.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setEtapas((es) => es.filter((_, k) => k !== i))}
                    className="mt-5 text-xs text-negativo underline"
                  >
                    remover
                  </button>
                </div>
                <textarea
                  value={e.itens}
                  onChange={(ev) => mudarEtapa(i, "itens", ev.target.value)}
                  rows={2}
                  placeholder="Checklist da etapa (um item por linha)"
                  className={`block w-full ${cls}`}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEtapas((es) => [...es, etapaVazia(es.at(-1)?.onda ?? 1)])}
              className="rounded-lg border border-linha px-3 py-1.5 text-xs text-cinza"
            >
              + Adicionar etapa
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={ocupado}
              onClick={salvar}
              className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
            >
              {ocupado ? "Salvando…" : "Salvar"}
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
        </div>
      )}
    </div>
  );
}
