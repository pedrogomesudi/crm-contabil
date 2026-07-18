"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { REGIMES } from "@/lib/tipos";
import { moverNaOrdem } from "@/lib/comercial/funilConfig";
import { BlocoFatores } from "./BlocoFatores";
import type { PrecificacaoView } from "./actions";
import {
  salvarBaseRegime,
  criarComplexidade,
  salvarComplexidade,
  removerComplexidade,
  reordenarComplexidades,
  criarServico,
  salvarServico,
  removerServico,
  salvarGlobais,
} from "./actions";

export function FormPrecificacao({ cfg }: { cfg: PrecificacaoView }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [novaComplexidade, setNovaComplexidade] = useState("");
  const [novoServico, setNovoServico] = useState("");

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  const baseDe = (regime: string) => cfg.regimes.find((r) => r.regime === regime)?.valorBase ?? 0;
  const idsComplex = cfg.complexidades.map((c) => c.id);

  return (
    <div className="space-y-6">
      {/* Valores-base por regime */}
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Valor-base por regime (mensal)</h2>
        <div className="grid gap-2 rounded-2xl border border-linha bg-white p-4 sm:grid-cols-2">
          {REGIMES.map((regime) => (
            <label key={regime} className="flex items-center justify-between gap-2 text-sm text-cinza">
              {regime}
              <input
                type="number"
                min={0}
                defaultValue={baseDe(regime)}
                disabled={ocupado}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v !== baseDe(regime)) void chamar(() => salvarBaseRegime(regime, v));
                }}
                className={`${controleCls("compacto")} w-32`}
              />
            </label>
          ))}
        </div>
      </section>

      <BlocoFatores fatores={cfg.fatores} />

      {/* Complexidade */}
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Complexidade (multiplicador)</h2>
        <div className="space-y-1.5">
          {cfg.complexidades.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-linha bg-white p-3">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Subir"
                  disabled={ocupado || i === 0}
                  onClick={() => chamar(() => reordenarComplexidades(moverNaOrdem(idsComplex, c.id, "cima")))}
                  className="rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Descer"
                  disabled={ocupado || i === cfg.complexidades.length - 1}
                  onClick={() => chamar(() => reordenarComplexidades(moverNaOrdem(idsComplex, c.id, "baixo")))}
                  className="mt-0.5 rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <input
                defaultValue={c.nome}
                disabled={ocupado}
                onBlur={(e) => {
                  const nome = e.target.value.trim();
                  if (nome && nome !== c.nome) void chamar(() => salvarComplexidade(c.id, nome, c.multiplicador));
                }}
                className={`${controleCls("compacto")} min-w-0 flex-1`}
              />
              <label className="flex items-center gap-1 text-xs text-cinza">
                ×
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  defaultValue={c.multiplicador}
                  disabled={ocupado}
                  onBlur={(e) => {
                    const m = Number(e.target.value);
                    if (Number.isFinite(m) && m !== c.multiplicador)
                      void chamar(() => salvarComplexidade(c.id, c.nome, m));
                  }}
                  className={`${controleCls("compacto")} w-20`}
                />
              </label>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => chamar(() => removerComplexidade(c.id))}
                className="text-xs text-cinza hover:text-negativo disabled:opacity-40"
              >
                remover
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={novaComplexidade}
            disabled={ocupado}
            placeholder="Novo nível"
            onChange={(e) => setNovaComplexidade(e.target.value)}
            className={`${controleCls("compacto")} min-w-0 flex-1 sm:max-w-xs`}
          />
          <Botao
            variante="primario"
            disabled={ocupado || !novaComplexidade.trim()}
            onClick={async () => {
              const nome = novaComplexidade.trim();
              if (!nome) return;
              setNovaComplexidade("");
              await chamar(() => criarComplexidade(nome));
            }}
          >
            Adicionar nível
          </Botao>
        </div>
      </section>

      {/* Serviços adicionais */}
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Serviços adicionais</h2>
        <div className="space-y-1.5">
          {cfg.servicos.map((sv) => (
            <div key={sv.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-linha bg-white p-3">
              <input
                defaultValue={sv.nome}
                disabled={ocupado}
                onBlur={(e) => {
                  const nome = e.target.value.trim();
                  if (nome && nome !== sv.nome)
                    void chamar(() =>
                      salvarServico(sv.id, {
                        nome,
                        valor: sv.valor,
                        recorrencia: sv.recorrencia as "mensal" | "unico",
                        ativo: sv.ativo,
                      }),
                    );
                }}
                className={`${controleCls("compacto")} min-w-0 flex-1`}
              />
              <label className="flex items-center gap-1 text-xs text-cinza">
                R$
                <input
                  type="number"
                  min={0}
                  defaultValue={sv.valor}
                  disabled={ocupado}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v !== sv.valor)
                      void chamar(() =>
                        salvarServico(sv.id, {
                          nome: sv.nome,
                          valor: v,
                          recorrencia: sv.recorrencia as "mensal" | "unico",
                          ativo: sv.ativo,
                        }),
                      );
                  }}
                  className={`${controleCls("compacto")} w-24`}
                />
              </label>
              <select
                defaultValue={sv.recorrencia}
                disabled={ocupado}
                onChange={(e) =>
                  chamar(() =>
                    salvarServico(sv.id, {
                      nome: sv.nome,
                      valor: sv.valor,
                      recorrencia: e.target.value as "mensal" | "unico",
                      ativo: sv.ativo,
                    }),
                  )
                }
                className={`${controleCls("compacto")} w-24`}
              >
                <option value="mensal">mensal</option>
                <option value="unico">único</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-cinza">
                <input
                  type="checkbox"
                  defaultChecked={sv.ativo}
                  disabled={ocupado}
                  onChange={(e) =>
                    chamar(() =>
                      salvarServico(sv.id, {
                        nome: sv.nome,
                        valor: sv.valor,
                        recorrencia: sv.recorrencia as "mensal" | "unico",
                        ativo: e.target.checked,
                      }),
                    )
                  }
                />
                ativo
              </label>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => chamar(() => removerServico(sv.id))}
                className="text-xs text-cinza hover:text-negativo disabled:opacity-40"
              >
                remover
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={novoServico}
            disabled={ocupado}
            placeholder="Novo serviço"
            onChange={(e) => setNovoServico(e.target.value)}
            className={`${controleCls("compacto")} min-w-0 flex-1 sm:max-w-xs`}
          />
          <Botao
            variante="primario"
            disabled={ocupado || !novoServico.trim()}
            onClick={async () => {
              const nome = novoServico.trim();
              if (!nome) return;
              setNovoServico("");
              await chamar(() => criarServico(nome));
            }}
          >
            Adicionar serviço
          </Botao>
        </div>
      </section>

      {/* Globais */}
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Piso e desconto</h2>
        <div className="flex flex-wrap gap-3 rounded-2xl border border-linha bg-white p-4">
          <label className="text-xs text-cinza">
            Valor mínimo (R$)
            <input
              type="number"
              min={0}
              defaultValue={cfg.global.valorMinimo}
              disabled={ocupado}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v !== cfg.global.valorMinimo)
                  void chamar(() => salvarGlobais(v, cfg.global.descontoMaximoPct));
              }}
              className={`${controleCls("compacto")} mt-0.5 block w-32`}
            />
          </label>
          <label className="text-xs text-cinza">
            Desconto máximo (%)
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={cfg.global.descontoMaximoPct}
              disabled={ocupado}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v !== cfg.global.descontoMaximoPct)
                  void chamar(() => salvarGlobais(cfg.global.valorMinimo, v));
              }}
              className={`${controleCls("compacto")} mt-0.5 block w-32`}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
