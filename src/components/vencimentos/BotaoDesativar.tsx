"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desativarCertificado, desativarProcuracao } from "@/app/(app)/vencimentos/crud-actions";

export function BotaoDesativar({
  id,
  clienteId,
  tipo,
}: {
  id: string;
  clienteId: string;
  tipo: "certificado" | "procuracao";
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  if (!confirmando)
    return (
      <button
        onClick={() => setConfirmando(true)}
        className="rounded-lg border border-linha px-2 py-1 text-xs text-cinza"
      >
        Desativar
      </button>
    );

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        disabled={pend}
        onClick={() =>
          start(async () => {
            setErro(null);
            const r =
              tipo === "certificado"
                ? await desativarCertificado(id, clienteId)
                : await desativarProcuracao(id, clienteId);
            if (r.erro) setErro(r.erro);
            else router.refresh();
          })
        }
        className="rounded-lg bg-negativo px-2 py-1 text-white disabled:opacity-60"
      >
        {pend ? "…" : "Confirmar"}
      </button>
      <button onClick={() => setConfirmando(false)} className="rounded-lg border border-linha px-2 py-1">
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
