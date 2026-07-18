"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { rotuloEtapa, type Etapa } from "@/lib/comercial/funil";
import { moverNaOrdem, probParaPct } from "@/lib/comercial/funilConfig";
import {
  criarEtapa,
  renomearEtapa,
  recolorirEtapa,
  definirProbabilidade,
  reordenarEtapas,
  arquivarEtapa,
} from "./actions";

const TERMINAIS_UI: { chave: "ganho" | "perdido"; classe: string }[] = [
  { chave: "ganho", classe: "text-verde" },
  { chave: "perdido", classe: "text-negativo" },
];

export function EtapasFunil({ etapas }: { etapas: Etapa[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [nova, setNova] = useState("");
  // Rótulos em edição local; salvos no blur/Enter.
  const [rotulos, setRotulos] = useState<Record<string, string>>(() =>
    Object.fromEntries(etapas.map((e) => [e.id, e.rotulo])),
  );

  async function chamar(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (r?.erro) return alert(r.erro);
    router.refresh();
  }

  const ordemIds = etapas.map((e) => e.id);

  async function adicionar() {
    const rotulo = nova.trim();
    if (!rotulo) return;
    setNova("");
    await chamar(() => criarEtapa(rotulo));
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {etapas.map((e, i) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-linha bg-white p-3">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Subir"
                disabled={ocupado || i === 0}
                onClick={() => chamar(() => reordenarEtapas(moverNaOrdem(ordemIds, e.id, "cima")))}
                className="rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Descer"
                disabled={ocupado || i === etapas.length - 1}
                onClick={() => chamar(() => reordenarEtapas(moverNaOrdem(ordemIds, e.id, "baixo")))}
                className="mt-0.5 rounded border border-linha px-1 text-xs leading-none disabled:opacity-30"
              >
                ↓
              </button>
            </div>

            <input
              type="color"
              value={e.cor}
              aria-label={`Cor de ${e.rotulo}`}
              disabled={ocupado}
              onChange={(ev) => chamar(() => recolorirEtapa(e.id, ev.target.value))}
              className="h-8 w-8 flex-none cursor-pointer rounded ring-1 ring-inset ring-linha"
            />

            <input
              value={rotulos[e.id] ?? ""}
              disabled={ocupado}
              onChange={(ev) => setRotulos((m) => ({ ...m, [e.id]: ev.target.value }))}
              onBlur={() => {
                const v = (rotulos[e.id] ?? "").trim();
                if (v && v !== e.rotulo) void chamar(() => renomearEtapa(e.id, v));
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") ev.currentTarget.blur();
              }}
              className={`${controleCls("compacto")} min-w-0 flex-1`}
            />

            <label className="flex items-center gap-1 text-xs text-cinza">
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={probParaPct(e.probabilidade)}
                disabled={ocupado}
                onBlur={(ev) => {
                  const pct = Number(ev.target.value);
                  if (Number.isFinite(pct) && pct !== probParaPct(e.probabilidade)) {
                    void chamar(() => definirProbabilidade(e.id, pct));
                  }
                }}
                className={`${controleCls("compacto")} w-16`}
              />
              %
            </label>

            <button
              type="button"
              disabled={ocupado}
              onClick={() => chamar(() => arquivarEtapa(e.id))}
              className="rounded border border-linha px-2 py-1 text-xs text-cinza hover:text-negativo disabled:opacity-40"
            >
              Arquivar
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nova}
          disabled={ocupado}
          placeholder="Nome da nova etapa"
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void adicionar();
          }}
          className={`${controleCls("compacto")} min-w-0 flex-1 sm:max-w-xs`}
        />
        <Botao variante="primario" disabled={ocupado || !nova.trim()} onClick={adicionar}>
          Adicionar etapa
        </Botao>
      </div>

      <div className="rounded-2xl border border-linha bg-creme/40 p-3">
        <p className="text-xs text-cinza">Estados de sistema — sempre existem e não são editáveis.</p>
        <div className="mt-2 flex gap-2">
          {TERMINAIS_UI.map((t) => (
            <span key={t.chave} className={`rounded-full border border-linha px-2.5 py-0.5 text-xs ${t.classe}`}>
              {rotuloEtapa(t.chave, [])}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
