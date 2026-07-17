"use client";
import { controleCls } from "@/components/ui/Campo";
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
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-0.5 text-xs text-negativo">
        Cancelar
      </button>
    );

  return (
    <div className="mt-1 w-64 space-y-1 rounded border border-linha p-2 text-xs">
      <select
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as "1" | "2" | "9")}
        className={`${controleCls("compacto")} w-full`}
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
        className={`${controleCls("compacto")} w-full`}
      />
      {erro && (
        <p role="alert" className="text-negativo">
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
