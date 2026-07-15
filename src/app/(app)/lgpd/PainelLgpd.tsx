"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BASES_LEGAIS, rotuloBaseLegal } from "@/lib/lgpd/tipos";
import { formatarData } from "@/lib/format";
import {
  salvarTratamento,
  excluirTratamento,
  semearTratamentos,
  salvarConfigLgpd,
} from "./actions";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";

type Tratamento = {
  id: string;
  finalidade: string;
  categorias: string;
  base_legal: string;
  retencao: string | null;
  ativo: boolean;
  ordem: number;
};
type SolicView = { id: string; tipo: string; status: string; cliente: string; criadoEm: string };

export function PainelLgpd({
  tratamentos,
  solicitacoes,
  retencaoMeses,
  encarregado,
}: {
  tratamentos: Tratamento[];
  solicitacoes: SolicView[];
  retencaoMeses: number;
  encarregado: string;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Tratamento> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [meses, setMeses] = useState(retencaoMeses);
  const [dpo, setDpo] = useState(encarregado);

  const acao = async (fn: () => Promise<{ ok?: boolean; erro?: string }>, sucesso: string) => {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    setMsg(r.erro ?? sucesso);
    if (!r.erro) router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Configuração */}
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h2 className="font-display text-sm font-semibold text-texto">Configuração</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-cinza">
            Retenção padrão (meses)
            <input type="number" min={0} max={600} value={meses} onChange={(e) => setMeses(Number(e.target.value))} className={`mt-0.5 block w-24 ${cls}`} />
            <span className="mt-0.5 block text-[11px] text-cinza-claro">Trava da anonimização: até vencer, o esqueleto é retido.</span>
          </label>
          <label className="flex-1 text-xs text-cinza">
            Encarregado (DPO)
            <input value={dpo} onChange={(e) => setDpo(e.target.value)} placeholder="Nome e e-mail do encarregado" className={`mt-0.5 block w-full ${cls}`} />
          </label>
          <button
            disabled={ocupado}
            onClick={() => acao(() => salvarConfigLgpd({ retencaoMeses: meses, encarregado: dpo }), "Configuração salva.")}
            className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
          >
            Salvar
          </button>
        </div>
      </section>

      {/* ROPA */}
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-texto">Registro de tratamentos (ROPA)</h2>
          <div className="flex gap-2">
            {tratamentos.length === 0 && (
              <button disabled={ocupado} onClick={() => acao(() => semearTratamentos(), "Padrão restaurado.")} className="rounded-lg border border-linha px-3 py-1.5 text-xs text-cinza">
                Restaurar padrão
              </button>
            )}
            <button onClick={() => setEdit({ base_legal: "contrato", ativo: true, ordem: tratamentos.length + 1 })} className="rounded-lg bg-verde px-3 py-1.5 text-xs text-white">
              Novo
            </button>
          </div>
        </div>

        {tratamentos.length === 0 ? (
          <p className="text-cinza">Nenhum tratamento. Use “Restaurar padrão” para semear os típicos de um escritório contábil.</p>
        ) : (
          <ul className="space-y-1.5">
            {tratamentos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-linha pb-1.5 last:border-0">
                <span>
                  <span className="font-medium text-texto">{t.finalidade}</span>
                  {!t.ativo && <span className="ml-1 text-xs text-cinza">(inativo)</span>}
                  <span className="block text-xs text-cinza">{rotuloBaseLegal(t.base_legal)} · {t.categorias}{t.retencao ? ` · ${t.retencao}` : ""}</span>
                </span>
                <span className="flex gap-3 text-xs">
                  <button onClick={() => setEdit(t)} className="text-verde underline">editar</button>
                  <button disabled={ocupado} onClick={() => acao(() => excluirTratamento(t.id), "Excluído.")} className="text-negativo underline">excluir</button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {edit && (
          <div className="space-y-2 rounded-lg border border-linha p-3">
            <div className="flex flex-wrap gap-2">
              <label className="flex-1 text-xs text-cinza">Finalidade
                <input value={edit.finalidade ?? ""} onChange={(e) => setEdit({ ...edit, finalidade: e.target.value })} className={`mt-0.5 block w-full ${cls}`} />
              </label>
              <label className="text-xs text-cinza">Base legal
                <select value={edit.base_legal} onChange={(e) => setEdit({ ...edit, base_legal: e.target.value })} className={`mt-0.5 block ${cls}`}>
                  {BASES_LEGAIS.map((b) => <option key={b.valor} value={b.valor}>{b.rotulo}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs text-cinza">Categorias de dado
              <input value={edit.categorias ?? ""} onChange={(e) => setEdit({ ...edit, categorias: e.target.value })} className={`mt-0.5 block w-full ${cls}`} />
            </label>
            <label className="block text-xs text-cinza">Prazo de retenção
              <input value={edit.retencao ?? ""} onChange={(e) => setEdit({ ...edit, retencao: e.target.value })} className={`mt-0.5 block w-full ${cls}`} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-cinza">
              <input type="checkbox" checked={edit.ativo ?? true} onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })} /> Ativo
            </label>
            <div className="flex items-center gap-3">
              <button
                disabled={ocupado}
                onClick={() =>
                  acao(
                    () =>
                      salvarTratamento({
                        id: edit.id,
                        finalidade: edit.finalidade ?? "",
                        categorias: edit.categorias ?? "",
                        base_legal: edit.base_legal ?? "contrato",
                        retencao: edit.retencao ?? "",
                        ativo: edit.ativo ?? true,
                        ordem: edit.ordem ?? 0,
                      }).then((r) => {
                        if (!r.erro) setEdit(null);
                        return r;
                      }),
                    "Tratamento salvo.",
                  )
                }
                className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
              >
                Salvar
              </button>
              <button onClick={() => setEdit(null)} className="text-xs text-cinza underline">cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Solicitações */}
      <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
        <h2 className="font-display text-sm font-semibold text-texto">Solicitações do titular</h2>
        {solicitacoes.length === 0 ? (
          <p className="text-cinza">Nenhuma solicitação registrada. Gere relatórios ou registre pedidos de exclusão na ficha do cliente.</p>
        ) : (
          <ul className="space-y-1.5">
            {solicitacoes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-linha pb-1.5 text-xs last:border-0">
                <span className="text-texto">{s.cliente}</span>
                <span className="flex gap-3 text-cinza">
                  <span>{s.tipo === "acesso" ? "Acesso" : "Exclusão"}</span>
                  <span>{s.status === "concluida" ? "Concluída" : "Aberta"}</span>
                  <span>{formatarData(s.criadoEm)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && <p className="text-sm text-cinza">{msg}</p>}
    </div>
  );
}
