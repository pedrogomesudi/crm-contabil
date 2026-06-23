"use client";
import { useState, useTransition } from "react";
import { excluirDocumento } from "@/app/(app)/documentos/actions";

// Exclusão (somente admin). Confirma antes e exibe erro se a action recusar.
export function BotaoExcluirDocumento({
  documentoId,
  clienteId,
  nome,
}: {
  documentoId: string;
  clienteId: string;
  nome: string;
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function excluir() {
    if (!window.confirm(`Excluir o documento “${nome}”? Esta ação não pode ser desfeita.`)) return;
    setErro(null);
    start(async () => {
      const res = await excluirDocumento(documentoId, clienteId);
      if (res.erro) setErro(res.erro);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={excluir}
        disabled={pending}
        aria-label={`Excluir ${nome}`}
        className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-60"
      >
        {pending ? "Excluindo..." : "Excluir"}
      </button>
      {erro && (
        <span role="alert" className="text-xs text-red-600">
          {erro}
        </span>
      )}
    </span>
  );
}
