"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { moverNaOrdem } from "@/lib/comercial/funilConfig";
import type { FollowupView } from "./actions";
import {
  salvarConfigFollowup,
  criarEtapaFollowup,
  salvarEtapaFollowup,
  removerEtapaFollowup,
  reordenarEtapasFollowup,
} from "./actions";

export function FormFollowup({ cfg }: { cfg: FollowupView }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  const ids = cfg.etapas.map((e) => e.id);
  const canal = cfg.config.canal;

  return (
    <div className="space-y-6">
      {/* Canal + Ativo */}
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Canal e ativação</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-linha bg-white p-4">
          <label className="text-xs text-cinza">
            Canal
            <select
              value={canal}
              disabled={ocupado}
              onChange={(e) =>
                chamar(() => salvarConfigFollowup(e.target.value as "email" | "whatsapp", cfg.config.ativo))
              }
              className={`${controleCls("compacto")} mt-0.5 block w-40`}
            >
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-cinza">
            <input
              type="checkbox"
              checked={cfg.config.ativo}
              disabled={ocupado}
              onChange={(e) => chamar(() => salvarConfigFollowup(canal as "email" | "whatsapp", e.target.checked))}
            />
            Ativo
          </label>
        </div>
      </section>

      {/* Etapas */}
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold text-texto">Etapas da sequência</h2>
        <div className="space-y-2">
          {cfg.etapas.map((et, i) => (
            <div key={et.id} className="space-y-2 rounded-2xl border border-linha bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Subir"
                    disabled={ocupado || i === 0}
                    onClick={() => chamar(() => reordenarEtapasFollowup(moverNaOrdem(ids, et.id, "cima")))}
                    className="rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Descer"
                    disabled={ocupado || i === cfg.etapas.length - 1}
                    onClick={() => chamar(() => reordenarEtapasFollowup(moverNaOrdem(ids, et.id, "baixo")))}
                    className="mt-0.5 rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <label className="text-xs text-cinza">
                  Dias após o envio
                  <input
                    type="number"
                    min={0}
                    defaultValue={et.diasOffset}
                    disabled={ocupado}
                    onBlur={(e) => {
                      const d = Number(e.target.value);
                      if (Number.isInteger(d) && d !== et.diasOffset)
                        void chamar(() =>
                          salvarEtapaFollowup(et.id, {
                            diasOffset: d,
                            assunto: et.assunto,
                            template: et.template,
                            ativa: et.ativa,
                          }),
                        );
                    }}
                    className={`${controleCls("compacto")} ml-1 w-20`}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-cinza">
                  <input
                    type="checkbox"
                    defaultChecked={et.ativa}
                    disabled={ocupado}
                    onChange={(e) =>
                      chamar(() =>
                        salvarEtapaFollowup(et.id, {
                          diasOffset: et.diasOffset,
                          assunto: et.assunto,
                          template: et.template,
                          ativa: e.target.checked,
                        }),
                      )
                    }
                  />
                  Ativa
                </label>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => chamar(() => removerEtapaFollowup(et.id))}
                  className="ml-auto text-xs text-cinza hover:text-negativo disabled:opacity-40"
                >
                  remover
                </button>
              </div>
              {canal === "email" && (
                <label className="block text-xs text-cinza">
                  Assunto (e-mail)
                  <input
                    defaultValue={et.assunto ?? ""}
                    disabled={ocupado}
                    onBlur={(e) => {
                      const a = e.target.value;
                      if (a !== (et.assunto ?? ""))
                        void chamar(() =>
                          salvarEtapaFollowup(et.id, {
                            diasOffset: et.diasOffset,
                            assunto: a || null,
                            template: et.template,
                            ativa: et.ativa,
                          }),
                        );
                    }}
                    className={`${controleCls("compacto")} mt-0.5 w-full`}
                  />
                </label>
              )}
              <label className="block text-xs text-cinza">
                Mensagem
                <textarea
                  defaultValue={et.template}
                  disabled={ocupado}
                  rows={3}
                  onBlur={(e) => {
                    const t = e.target.value;
                    if (t.trim() && t !== et.template)
                      void chamar(() =>
                        salvarEtapaFollowup(et.id, {
                          diasOffset: et.diasOffset,
                          assunto: et.assunto,
                          template: t,
                          ativa: et.ativa,
                        }),
                      );
                  }}
                  className={`${controleCls("compacto")} mt-0.5 w-full`}
                />
              </label>
            </div>
          ))}
        </div>
        <Botao variante="primario" disabled={ocupado} onClick={() => chamar(() => criarEtapaFollowup())}>
          Adicionar etapa
        </Botao>
        <p className="text-[11px] text-cinza">
          Variáveis disponíveis: <code>{"{prospect}"}</code> <code>{"{numero}"}</code> <code>{"{valor}"}</code>{" "}
          <code>{"{validade}"}</code>
        </p>
      </section>
    </div>
  );
}
