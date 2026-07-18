"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { moverNaOrdem } from "@/lib/comercial/funilConfig";
import type { PrecificacaoView } from "./actions";
import {
  definirModoFator,
  salvarUnidadeFator,
  criarFaixa,
  salvarFaixa,
  removerFaixa,
  reordenarFaixas,
} from "./actions";

const ROTULO: Record<string, string> = {
  faturamento: "Faturamento",
  funcionarios: "Funcionários",
  notas: "Notas",
};

export function BlocoFatores({ fatores }: { fatores: PrecificacaoView["fatores"] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold text-texto">Acréscimos por fator</h2>
      {fatores.map((f) => {
        const ids = f.faixas.map((x) => x.id);
        return (
          <div key={f.fator} className="space-y-2 rounded-2xl border border-linha bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-texto">{ROTULO[f.fator] ?? f.fator}</span>
              <div className="flex overflow-hidden rounded-lg border border-linha text-xs">
                {(["faixas", "unidade"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={ocupado}
                    onClick={() => chamar(() => definirModoFator(f.fator, m))}
                    className={`px-3 py-1 ${f.modo === m ? "bg-verde/10 text-verde" : "text-cinza hover:text-texto"}`}
                  >
                    {m === "faixas" ? "Faixas" : "Por unidade"}
                  </button>
                ))}
              </div>
            </div>

            {f.modo === "unidade" ? (
              <div className="flex flex-wrap gap-2">
                <label className="text-xs text-cinza">
                  Valor unitário (R$)
                  <input
                    type="number"
                    min={0}
                    defaultValue={f.valorUnitario}
                    disabled={ocupado}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v !== f.valorUnitario) {
                        void chamar(() => salvarUnidadeFator(f.fator, v, f.franquia));
                      }
                    }}
                    className={`${controleCls("compacto")} mt-0.5 block w-32`}
                  />
                </label>
                <label className="text-xs text-cinza">
                  Franquia (grátis até)
                  <input
                    type="number"
                    min={0}
                    defaultValue={f.franquia}
                    disabled={ocupado}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v !== f.franquia) {
                        void chamar(() => salvarUnidadeFator(f.fator, f.valorUnitario, v));
                      }
                    }}
                    className={`${controleCls("compacto")} mt-0.5 block w-32`}
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-1.5">
                {f.faixas.map((fx, i) => (
                  <div key={fx.id} className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="Subir"
                        disabled={ocupado || i === 0}
                        onClick={() => chamar(() => reordenarFaixas(moverNaOrdem(ids, fx.id, "cima")))}
                        className="rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Descer"
                        disabled={ocupado || i === f.faixas.length - 1}
                        onClick={() => chamar(() => reordenarFaixas(moverNaOrdem(ids, fx.id, "baixo")))}
                        className="mt-0.5 rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                    <label className="text-xs text-cinza">
                      até
                      <input
                        type="number"
                        min={0}
                        defaultValue={fx.ate ?? ""}
                        placeholder="∞"
                        disabled={ocupado}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const ate = raw === "" ? null : Number(raw);
                          if (ate !== fx.ate) void chamar(() => salvarFaixa(fx.id, ate, fx.valor));
                        }}
                        className={`${controleCls("compacto")} ml-1 w-28`}
                      />
                    </label>
                    <label className="text-xs text-cinza">
                      → R$
                      <input
                        type="number"
                        min={0}
                        defaultValue={fx.valor}
                        disabled={ocupado}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== fx.valor) void chamar(() => salvarFaixa(fx.id, fx.ate, v));
                        }}
                        className={`${controleCls("compacto")} ml-1 w-28`}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => chamar(() => removerFaixa(fx.id))}
                      className="text-xs text-cinza hover:text-negativo disabled:opacity-40"
                    >
                      remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => chamar(() => criarFaixa(f.fator))}
                  className="rounded-lg border border-dashed border-linha px-2 py-1 text-xs text-cinza hover:text-texto disabled:opacity-40"
                >
                  + Adicionar faixa
                </button>
                <p className="text-[11px] text-cinza-claro">
                  A última faixa (até vazio = ∞) cobre todos os valores acima.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
