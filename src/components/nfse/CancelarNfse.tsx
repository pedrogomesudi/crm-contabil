"use client";
import { useState, useTransition } from "react";
import { cancelarNfse } from "@/app/(app)/clientes/[id]/nfse";

export function CancelarNfse({ nfseId }: { nfseId: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<"1" | "2" | "9">("1");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-0.5 text-xs text-red-700">
        Cancelar
      </button>
    );

  return (
    <div className="mt-1 space-y-1 rounded border border-slate-200 p-2 text-xs">
      <select
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as "1" | "2" | "9")}
        className="w-full rounded border border-slate-300 px-1 py-0.5"
      >
        <option value="1">1 - Erro na emissão</option>
        <option value="2">2 - Serviço não prestado</option>
        <option value="9">9 - Outros</option>
      </select>
      <textarea
        value={justificativa}
        onChange={(e) => setJustificativa(e.target.value)}
        placeholder="Justificativa (mín. 15 caracteres)"
        rows={2}
        className="w-full rounded border border-slate-300 px-1 py-0.5"
      />
      {erro && (
        <p role="alert" className="text-red-600">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          disabled={pend}
          onClick={() =>
            start(async () => {
              setErro(null);
              const r = await cancelarNfse(nfseId, motivo, justificativa);
              if (r.erro) setErro(r.erro);
              else setAberto(false);
            })
          }
          className="rounded bg-red-700 px-2 py-0.5 text-white disabled:opacity-60"
        >
          {pend ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button onClick={() => setAberto(false)} className="rounded border px-2 py-0.5">
          Voltar
        </button>
      </div>
    </div>
  );
}
