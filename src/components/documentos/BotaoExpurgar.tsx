"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirDocumento } from "@/app/(app)/documentos/actions";

export function BotaoExpurgar({
  documentoId,
  clienteId,
  nome,
}: {
  documentoId: string;
  clienteId: string;
  nome: string;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  function expurgar() {
    if (!window.confirm(`Expurgar (excluir) “${nome}”? Esta ação não pode ser desfeita.`)) return;
    setErro(null);
    start(async () => {
      const r = await excluirDocumento(documentoId, clienteId);
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={expurgar} disabled={pend} className="text-negativo underline disabled:opacity-60">
        Expurgar
      </button>
      {erro && <span className="text-xs text-negativo">{erro}</span>}
    </span>
  );
}
