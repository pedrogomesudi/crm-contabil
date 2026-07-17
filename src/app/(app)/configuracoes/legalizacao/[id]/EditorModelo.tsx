"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  salvarModelo,
  excluirModelo,
  salvarEtapa,
  excluirEtapa,
  reordenarEtapa,
  type ModeloDetalhe,
  type EtapaModelo,
} from "../actions";
import { LEGALIZACAO_TIPOS, LEGALIZACAO_ORGAOS } from "@/lib/legalizacao/tipos";

const PAPEIS = [
  { v: "", l: "—" },
  { v: "admin", l: "Admin" },
  { v: "contador", l: "Contador" },
  { v: "assistente", l: "Assistente" },
  { v: "financeiro", l: "Financeiro" },
];
const cls = controleCls("compacto");

export function EditorModelo({ modelo }: { modelo: ModeloDetalhe }) {
  const router = useRouter();
  const [nome, setNome] = useState(modelo.nome);
  const [descricao, setDescricao] = useState(modelo.descricao ?? "");
  const [tipo, setTipo] = useState<string>(modelo.tipo);
  const [ativo, setAtivo] = useState(modelo.ativo);
  const [ocupado, setOcupado] = useState(false);

  async function run(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  async function salvarMeta() {
    await run(() => salvarModelo(modelo.id, { nome, descricao: descricao || null, tipo, ativo }));
  }
  async function excluir() {
    if (!confirm("Excluir este modelo? Processos já iniciados não são afetados.")) return;
    setOcupado(true);
    const r = await excluirModelo(modelo.id);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.push("/configuracoes/legalizacao");
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-cinza">
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={`mt-0.5 block w-full ${cls}`} />
          </label>
          <label className="col-span-2 text-xs text-cinza">
            Descrição
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={`mt-0.5 block w-full ${cls}`}
            />
          </label>
          <label className="text-xs text-cinza">
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`mt-0.5 block w-full ${cls}`}>
              {LEGALIZACAO_TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5 text-xs text-cinza">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={ocupado}
            onClick={salvarMeta}
            className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
          >
            Salvar
          </button>
          <button disabled={ocupado} onClick={excluir} className="text-xs text-negativo underline">
            Excluir modelo
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-texto">Etapas</h3>
          <button
            disabled={ocupado}
            onClick={() =>
              run(() =>
                salvarEtapa({
                  templateId: modelo.id,
                  titulo: "Nova etapa",
                  descricao: null,
                  orgao: "outro",
                  prazoDias: null,
                  responsavelPapel: null,
                  anexoObrigatorio: false,
                  avisarCliente: false,
                }),
              )
            }
            className="text-xs text-verde underline"
          >
            + etapa
          </button>
        </div>
        {modelo.etapas.length === 0 ? (
          <p className="text-sm text-cinza">Nenhuma etapa. Adicione a primeira.</p>
        ) : (
          modelo.etapas.map((e, i) => (
            <EtapaEditor
              key={e.id}
              etapa={e}
              templateId={modelo.id}
              primeira={i === 0}
              ultima={i === modelo.etapas.length - 1}
              ocupado={ocupado}
              run={run}
            />
          ))
        )}
      </section>
    </div>
  );
}

function EtapaEditor({
  etapa,
  templateId,
  primeira,
  ultima,
  ocupado,
  run,
}: {
  etapa: EtapaModelo;
  templateId: string;
  primeira: boolean;
  ultima: boolean;
  ocupado: boolean;
  run: (fn: () => Promise<{ ok?: boolean; erro?: string }>) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(etapa.titulo);
  const [descricao, setDescricao] = useState(etapa.descricao ?? "");
  const [orgao, setOrgao] = useState<string>(etapa.orgao);
  const [prazo, setPrazo] = useState(etapa.prazoDias?.toString() ?? "");
  const [papel, setPapel] = useState(etapa.responsavelPapel ?? "");
  const [anexo, setAnexo] = useState(etapa.anexoObrigatorio);
  const [avisar, setAvisar] = useState(etapa.avisarCliente);

  return (
    <div className="space-y-2 rounded-2xl border border-linha bg-white p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-cinza">{etapa.ordem}</span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className={`flex-1 ${cls}`}
          placeholder="Título"
        />
        <button
          disabled={ocupado || primeira}
          onClick={() => run(() => reordenarEtapa(etapa.id, "cima"))}
          className="px-1 text-cinza disabled:opacity-30"
          aria-label="Subir"
        >
          ↑
        </button>
        <button
          disabled={ocupado || ultima}
          onClick={() => run(() => reordenarEtapa(etapa.id, "baixo"))}
          className="px-1 text-cinza disabled:opacity-30"
          aria-label="Descer"
        >
          ↓
        </button>
      </div>
      <input
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        className={`block w-full ${cls}`}
        placeholder="Descrição (opcional)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-cinza">
          Órgão
          <select value={orgao} onChange={(e) => setOrgao(e.target.value)} className={`ml-1 ${cls}`}>
            {LEGALIZACAO_ORGAOS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cinza">
          Prazo (dias)
          <input
            type="number"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            className={`ml-1 w-20 ${cls}`}
          />
        </label>
        <label className="text-xs text-cinza">
          Responsável
          <select value={papel} onChange={(e) => setPapel(e.target.value)} className={`ml-1 ${cls}`}>
            {PAPEIS.map((p) => (
              <option key={p.v} value={p.v}>
                {p.l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-cinza">
          <input type="checkbox" checked={anexo} onChange={(e) => setAnexo(e.target.checked)} /> Anexo obrigatório
        </label>
        <label className="flex items-center gap-1 text-xs text-cinza">
          <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} /> Avisar cliente
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={ocupado}
          onClick={() =>
            run(() =>
              salvarEtapa({
                id: etapa.id,
                templateId,
                titulo,
                descricao: descricao || null,
                orgao,
                prazoDias: prazo === "" ? null : Number(prazo),
                responsavelPapel: papel || null,
                anexoObrigatorio: anexo,
                avisarCliente: avisar,
              }),
            )
          }
          className="rounded-lg border border-linha px-3 py-1 disabled:opacity-60"
        >
          Salvar etapa
        </button>
        <button
          disabled={ocupado}
          onClick={() => {
            if (confirm("Remover esta etapa?")) run(() => excluirEtapa(etapa.id));
          }}
          className="text-xs text-negativo underline"
        >
          remover
        </button>
      </div>
    </div>
  );
}
