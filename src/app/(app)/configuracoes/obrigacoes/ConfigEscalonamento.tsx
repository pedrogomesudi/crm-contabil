"use client";
import { useState } from "react";
import { salvarConfigEscalonamento, type ConfigEscalonamentoView } from "./actions";

export function ConfigEscalonamento({ inicial }: { inicial: ConfigEscalonamentoView }) {
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [diasLider, setDiasLider] = useState(inicial.diasLider);
  const [diasSocio, setDiasSocio] = useState(inicial.diasSocio);
  const [msg, setMsg] = useState("");

  async function salvar() {
    const r = await salvarConfigEscalonamento({ ativo, diasLider, diasSocio });
    setMsg(r.ok ? "Salvo." : (r.erro ?? "Erro"));
  }
  const num = "w-16 rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <section className="space-y-2 rounded-2xl border border-linha bg-white p-3">
      <h2 className="font-display text-lg font-semibold text-texto">Escalonamento de atrasos</h2>
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Ativar escalonamento
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm text-cinza">
        <label>
          escala ao <strong>líder</strong> após{" "}
          <input
            type="number"
            min={1}
            value={diasLider}
            onChange={(e) => setDiasLider(Number(e.target.value))}
            className={num}
          />{" "}
          dias de atraso
        </label>
        <label>
          ao <strong>sócio</strong> após{" "}
          <input
            type="number"
            min={1}
            value={diasSocio}
            onChange={(e) => setDiasSocio(Number(e.target.value))}
            className={num}
          />{" "}
          dias
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={salvar}
          className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white"
        >
          Salvar
        </button>
        {msg && <span className="text-sm text-cinza">{msg}</span>}
      </div>
    </section>
  );
}
