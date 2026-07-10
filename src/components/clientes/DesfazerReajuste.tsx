"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desfazerReajuste } from "@/app/(app)/financeiro/reajuste/actions";

export function DesfazerReajuste({ itemId, clienteId }: { itemId: string; clienteId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  if (!confirmando)
    return (
      <button
        onClick={() => setConfirmando(true)}
        className="rounded border border-linha px-2 py-0.5 text-xs text-cinza"
      >
        Desfazer
      </button>
    );

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        disabled={pend}
        onClick={() =>
          start(async () => {
            setErro(null);
            const r = await desfazerReajuste(itemId, clienteId);
            if (r.erro) setErro(r.erro);
            else router.refresh();
          })
        }
        className="rounded bg-negativo px-2 py-0.5 text-white disabled:opacity-60"
      >
        {pend ? "…" : "Confirmar"}
      </button>
      <button onClick={() => setConfirmando(false)} className="rounded border border-linha px-2 py-0.5">
        Voltar
      </button>
      {erro && (
        <span role="alert" className="text-negativo">
          {erro}
        </span>
      )}
    </span>
  );
}
