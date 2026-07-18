"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  etapaAdjacente,
  resumoFunil,
  rotuloEtapa,
  diasNaEtapa,
  corDias,
  type Etapa,
  type ChaveEtapa,
} from "@/lib/comercial/funil";
import { resumoPipeline } from "@/lib/comercial/metricas";
import { Iniciais } from "@/components/ui/Iniciais";
import { Badge } from "@/components/ui/Badge";
import { badgeRegime } from "@/lib/ui/apresentacao";
import { REGIMES } from "@/lib/tipos";
import {
  criarOportunidade,
  salvarOportunidade,
  definirEtapa,
  type OportunidadeView,
  type OportunidadeInput,
} from "./actions";
import { Botao } from "@/components/ui/Botao";
import { StatCard } from "@/components/ui/StatCard";

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const TEXTO_DIAS: Record<"recente" | "atencao" | "parado", string> = {
  recente: "text-cinza",
  atencao: "text-atencao",
  parado: "text-negativo",
};
const vazio = (): OportunidadeInput => ({
  prospectNome: "",
  contatoNome: null,
  contatoTelefone: null,
  contatoEmail: null,
  origem: null,
  servicoInteresse: null,
  valorEstimado: null,
  responsavelId: null,
  segmento: null,
  regime: null,
  observacoes: null,
});
const doView = (o: OportunidadeView): OportunidadeInput => ({
  prospectNome: o.prospectNome,
  contatoNome: o.contatoNome,
  contatoTelefone: o.contatoTelefone,
  contatoEmail: o.contatoEmail,
  origem: o.origem,
  servicoInteresse: o.servicoInteresse,
  valorEstimado: o.valorEstimado,
  responsavelId: o.responsavelId,
  segmento: o.segmento,
  regime: o.regime,
  observacoes: o.observacoes,
});

export function QuadroComercial({
  oportunidades,
  usuarios,
  etapas,
  agora,
}: {
  oportunidades: OportunidadeView[];
  usuarios: { id: string; nome: string }[];
  etapas: Etapa[];
  agora: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [soMinhas, setSoMinhas] = useState(false);
  const [busca, setBusca] = useState("");
  const [verFechados, setVerFechados] = useState(false);
  const [form, setForm] = useState<{ id: string | null; etapaId?: string; input: OportunidadeInput } | null>(null);
  const [arrastando, setArrastando] = useState<{ id: string; etapa: ChaveEtapa } | null>(null);
  const [sobreColuna, setSobreColuna] = useState<string | null>(null);

  function soltarNa(etapa: string) {
    const a = arrastando;
    setArrastando(null);
    setSobreColuna(null);
    if (a && a.etapa !== etapa) void chamar(() => definirEtapa(a.id, etapa));
  }

  const base = soMinhas ? oportunidades.filter((o) => o.meu) : oportunidades;
  const t = busca.trim().toLowerCase();
  const filtradas = t ? base.filter((o) => `${o.prospectNome} ${o.segmento ?? ""}`.toLowerCase().includes(t)) : base;
  const ativas = filtradas.filter((o) => o.etapa !== "ganho" && o.etapa !== "perdido");
  const fechadas = filtradas.filter((o) => o.etapa === "ganho" || o.etapa === "perdido");
  const resumo = resumoFunil(
    ativas.map((o) => ({ etapa: o.etapa, valorEstimado: o.valorEstimado })),
    etapas,
  );
  const topo = resumoPipeline(
    filtradas.map((o) => ({
      etapa: o.etapa,
      valorEstimado: o.valorEstimado,
      criadoEm: o.criadoEm,
      fechadoEm: o.fechadoEm,
    })),
    etapas,
  );

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }
  async function salvar() {
    if (!form) return;
    if (!form.input.prospectNome.trim()) return alert("Informe o prospect.");
    setOcupado(true);
    const r = await (form.id ? salvarOportunidade(form.id, form.input) : criarOportunidade(form.input, form.etapaId));
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    setForm(null);
    router.refresh();
  }
  function perder(id: string) {
    const motivo = window.prompt("Motivo da perda:");
    if (motivo === null) return;
    void chamar(() => definirEtapa(id, "perdido", motivo));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="primario" onClick={() => setForm({ id: null, input: vazio() })}>
          Nova oportunidade
        </Botao>
        <label className="flex items-center gap-1 text-sm text-cinza">
          <input type="checkbox" checked={soMinhas} onChange={(e) => setSoMinhas(e.target.checked)} /> Só as minhas
        </label>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar negócio…"
          className={`${controleCls("compacto")} w-full sm:ml-auto sm:w-56`}
        />
        <button
          type="button"
          onClick={() => setVerFechados((v) => !v)}
          aria-pressed={verFechados}
          className={`rounded-lg border px-3 py-1.5 text-sm ${verFechados ? "border-verde bg-verde/10 text-verde" : "border-linha text-cinza hover:text-texto"}`}
        >
          Fechados ({fechadas.length})
        </button>
      </div>

      {verFechados && (
        <div className="rounded-2xl border border-linha bg-white p-3">
          <div className="space-y-1.5">
            {fechadas.length === 0 && <p className="text-xs text-cinza">Nenhum fechado.</p>}
            {fechadas.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 border-b border-linha/60 pb-1 text-sm">
                <span className="font-medium text-texto">{o.prospectNome}</span>
                <span className={o.etapa === "ganho" ? "text-verde" : "text-negativo"}>
                  {rotuloEtapa(o.etapa, etapas)}
                </span>
                <span className="tabular-nums text-cinza">{brl(o.valorEstimado)}</span>
                {o.etapa === "perdido" && o.motivoPerda && (
                  <span className="text-[11px] text-cinza">— {o.motivoPerda}</span>
                )}
                {o.etapa === "ganho" &&
                  (o.clienteId ? (
                    <Link href={`/onboarding/${o.clienteId}`} className="ml-auto text-xs text-verde underline">
                      Ver onboarding
                    </Link>
                  ) : (
                    <Link href={`/clientes/novo?oportunidade=${o.id}`} className="ml-auto text-xs text-verde underline">
                      Converter em cliente
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard rotulo="Em pipeline" valor={brl(topo.valorPipeline)} />
        <StatCard rotulo="Ponderado" valor={brl(topo.valorPonderado)} variante="destaque" />
        <StatCard rotulo="Conversão" valor={`${Math.round(topo.taxaConversao * 100)}%`} variante="positivo" />
        <StatCard rotulo="Ciclo médio" valor={`${topo.cicloMedioDias} d`} />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {etapas.map((col) => {
          const doCol = ativas.filter((o) => o.etapa === col.id);
          const rs = resumo[col.id]!;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setSobreColuna(col.id);
              }}
              onDragLeave={() => setSobreColuna((s) => (s === col.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                soltarNa(col.id);
              }}
              className={`flex min-h-[60vh] min-w-[240px] flex-1 flex-col gap-2 rounded-2xl border bg-linha/60 p-2 ${sobreColuna === col.id ? "border-verde ring-1 ring-verde" : "border-linha"}`}
            >
              <div className="px-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: col.cor }} />
                  <div className="font-display text-xs font-semibold uppercase tracking-wide text-texto">
                    {col.rotulo}
                  </div>
                </div>
                <div className="text-[11px] text-cinza">
                  {rs.qtd} · {brl(rs.total)}
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {doCol.map((o) => (
                  <div
                    key={o.id}
                    draggable
                    onDragStart={() => setArrastando({ id: o.id, etapa: o.etapa })}
                    onDragEnd={() => {
                      setArrastando(null);
                      setSobreColuna(null);
                    }}
                    className="space-y-1 rounded-lg border border-linha bg-white px-2.5 py-2 text-sm cursor-grab"
                  >
                    <div className="flex items-start gap-2">
                      <Iniciais nome={o.responsavelNome ?? o.prospectNome} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-texto">{o.prospectNome}</span>
                          <span className="flex-none tabular-nums text-cinza">{brl(o.valorEstimado)}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-cinza">
                          {o.segmento && <span>{o.segmento}</span>}
                          {o.regime && <Badge variante={badgeRegime(o.regime)}>{o.regime}</Badge>}
                        </div>
                      </div>
                    </div>
                    {(() => {
                      const d = diasNaEtapa(o.etapaDesde, agora);
                      return <div className={`text-[11px] ${TEXTO_DIAS[corDias(d)]}`}>{d} d nesta etapa</div>;
                    })()}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[11px]">
                      <button
                        type="button"
                        disabled={ocupado || !etapaAdjacente(o.etapa, etapas, "anterior")}
                        onClick={() => {
                          const a = etapaAdjacente(o.etapa, etapas, "anterior");
                          if (a) void chamar(() => definirEtapa(o.id, a));
                        }}
                        className="rounded border border-linha px-1.5 disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={ocupado || !etapaAdjacente(o.etapa, etapas, "proxima")}
                        onClick={() => {
                          const a = etapaAdjacente(o.etapa, etapas, "proxima");
                          if (a) void chamar(() => definirEtapa(o.id, a));
                        }}
                        className="rounded border border-linha px-1.5 disabled:opacity-40"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        onClick={() => void chamar(() => definirEtapa(o.id, "ganho"))}
                        className="rounded border border-verde px-1.5 text-verde"
                      >
                        Ganho
                      </button>
                      <button
                        type="button"
                        onClick={() => perder(o.id)}
                        className="rounded border border-negativo px-1.5 text-negativo"
                      >
                        Perdido
                      </button>
                      <Link href={`/comercial/propostas?op=${o.id}`} className="ml-auto text-cinza underline">
                        propostas
                      </Link>
                      <button
                        type="button"
                        onClick={() => setForm({ id: o.id, input: doView(o) })}
                        className="text-cinza underline"
                      >
                        editar
                      </button>
                    </div>
                  </div>
                ))}
                {doCol.length === 0 && <p className="px-1 text-[11px] text-cinza-claro">—</p>}
              </div>
              <button
                type="button"
                onClick={() => setForm({ id: null, etapaId: col.id, input: vazio() })}
                className="w-full rounded-lg border border-dashed border-linha py-1 text-[11px] text-cinza hover:text-texto"
              >
                + Adicionar
              </button>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-texto">
              {form.id ? "Editar oportunidade" : "Nova oportunidade"}
            </h3>
            <label className="block text-xs text-cinza">
              Prospect
              <input
                value={form.input.prospectNome}
                onChange={(e) => setForm({ ...form, input: { ...form.input, prospectNome: e.target.value } })}
                className={`${controleCls("compacto")} mt-0.5 w-full`}
              />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Contato
                <input
                  value={form.input.contatoNome ?? ""}
                  onChange={(e) => setForm({ ...form, input: { ...form.input, contatoNome: e.target.value || null } })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
              <label className="flex-1 text-xs text-cinza">
                Telefone
                <input
                  value={form.input.contatoTelefone ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, input: { ...form.input, contatoTelefone: e.target.value || null } })
                  }
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                E-mail
                <input
                  value={form.input.contatoEmail ?? ""}
                  onChange={(e) => setForm({ ...form, input: { ...form.input, contatoEmail: e.target.value || null } })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
              <label className="w-32 text-xs text-cinza">
                Valor (R$)
                <input
                  type="number"
                  value={form.input.valorEstimado ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      input: { ...form.input, valorEstimado: e.target.value === "" ? null : Number(e.target.value) },
                    })
                  }
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Origem
                <input
                  value={form.input.origem ?? ""}
                  onChange={(e) => setForm({ ...form, input: { ...form.input, origem: e.target.value || null } })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
              <label className="flex-1 text-xs text-cinza">
                Serviço
                <input
                  value={form.input.servicoInteresse ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, input: { ...form.input, servicoInteresse: e.target.value || null } })
                  }
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-xs text-cinza">
                Segmento
                <input
                  value={form.input.segmento ?? ""}
                  onChange={(e) => setForm({ ...form, input: { ...form.input, segmento: e.target.value || null } })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
              <label className="flex-1 text-xs text-cinza">
                Regime
                <select
                  value={form.input.regime ?? ""}
                  onChange={(e) => setForm({ ...form, input: { ...form.input, regime: e.target.value || null } })}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                >
                  <option value="">—</option>
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs text-cinza">
              Responsável
              <select
                value={form.input.responsavelId ?? ""}
                onChange={(e) => setForm({ ...form, input: { ...form.input, responsavelId: e.target.value || null } })}
                className={`${controleCls("compacto")} mt-0.5 w-full`}
              >
                <option value="">—</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-cinza">
              Observações
              <textarea
                value={form.input.observacoes ?? ""}
                onChange={(e) => setForm({ ...form, input: { ...form.input, observacoes: e.target.value || null } })}
                rows={2}
                className={`${controleCls("compacto")} mt-0.5 w-full`}
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Botao variante="fantasma" onClick={() => setForm(null)}>
                Cancelar
              </Botao>
              <Botao variante="primario" disabled={ocupado || !form.input.prospectNome.trim()} onClick={salvar}>
                Salvar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
