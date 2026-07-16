"use client";
import { useState } from "react";
import { darBaixa, reabrir, alternarDispensa, urlComprovante } from "./baixa-actions";
import type { InstanciaView } from "./actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function AcoesInstancia({ inst, onDone }: { inst: InstanciaView; onDone: () => void }) {
  const [form, setForm] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setErro("");
    if (inst.comprovanteObrigatorio && !arquivo) {
      setErro("Comprovante obrigatório.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    if (arquivo) fd.set("comprovante", arquivo);
    fd.set("observacao", obs);
    const r = await darBaixa(inst.id, fd);
    setBusy(false);
    if (r.ok) {
      setForm(false);
      setArquivo(null);
      setObs("");
      onDone();
    } else setErro(r.erro ?? "Erro");
  }
  async function acao(fn: () => Promise<{ ok?: boolean; erro?: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) onDone();
    else setErro(r.erro ?? "Erro");
  }
  async function verComprovante() {
    const r = await urlComprovante(inst.id);
    if (r.url) window.open(r.url, "_blank", "noopener");
    else setErro(r.erro ?? "Erro");
  }

  if (inst.status === "entregue") {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-cinza">
        <span className="text-verde">
          ✓ entregue{inst.entregueEm ? ` em ${dataBR(inst.entregueEm)}` : ""}
          {inst.entreguePorNome ? ` por ${inst.entreguePorNome}` : ""}
        </span>
        {inst.temComprovante && (
          <button type="button" onClick={verComprovante} className="text-verde underline">
            comprovante
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => acao(() => reabrir(inst.id))} className="underline">
          reabrir
        </button>
        {erro && <span className="text-negativo">{erro}</span>}
      </span>
    );
  }
  if (inst.status === "dispensada") {
    return (
      <span className="flex items-center gap-2 text-xs text-cinza">
        dispensada
        <button
          type="button"
          disabled={busy}
          onClick={() => acao(() => alternarDispensa(inst.id, false))}
          className="underline"
        >
          reativar
        </button>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1 text-xs">
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setForm((v) => !v)}
          className="rounded bg-verde px-2 py-0.5 font-medium text-white"
        >
          Dar baixa
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => acao(() => alternarDispensa(inst.id, true))}
          className="text-cinza underline"
        >
          dispensar
        </button>
      </span>
      {form && (
        <span className="flex flex-col gap-1 rounded-lg border border-linha bg-white p-2">
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observação (opcional)"
            className="rounded border border-linha px-2 py-1"
          />
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={confirmar}
              className="rounded bg-verde px-2 py-0.5 font-medium text-white"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setForm(false)} className="text-cinza underline">
              cancelar
            </button>
          </span>
          {inst.comprovanteObrigatorio && (
            <span className="text-cinza">Comprovante obrigatório (PDF/PNG/JPG ≤ 10 MB).</span>
          )}
          {erro && <span className="text-negativo">{erro}</span>}
        </span>
      )}
    </span>
  );
}
