"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirCliente, restaurarCliente } from "@/app/(app)/clientes/actions";
import { formatarData } from "@/lib/format";

export function AcoesExclusaoCliente({ clienteId, excluidoEm }: { clienteId: string; excluidoEm: string | null }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  // Cliente excluído: faixa de aviso + Restaurar.
  if (excluidoEm) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-atencao-borda bg-atencao-fundo p-3 text-sm">
        <span className="text-atencao">Cliente excluído em {formatarData(excluidoEm)}.</span>
        <div className="flex flex-col items-end gap-1">
          <button
            disabled={pend}
            onClick={() =>
              start(async () => {
                setErro(null);
                const r = await restaurarCliente(clienteId);
                if (r.erro) setErro(r.erro);
                else router.refresh();
              })
            }
            className="rounded border border-atencao-borda px-3 py-1 text-atencao disabled:opacity-60"
          >
            {pend ? "Restaurando…" : "Restaurar"}
          </button>
          {erro && (
            <p role="alert" className="text-xs text-negativo">
              {erro}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Cliente ativo: botão Excluir com confirmação inline (sem window.confirm).
  return (
    <div className="rounded border border-linha p-3 text-sm">
      {!confirmando ? (
        <button
          onClick={() => setConfirmando(true)}
          className="rounded border border-negativo/40 px-3 py-1 text-negativo"
        >
          Excluir cliente
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-cinza">
            Excluir este cliente? O histórico é preservado e um administrador pode restaurá-lo.
          </p>
          <div className="flex gap-2">
            <button
              disabled={pend}
              onClick={() =>
                start(async () => {
                  setErro(null);
                  const r = await excluirCliente(clienteId);
                  if (r.erro) setErro(r.erro);
                  else router.refresh();
                })
              }
              className="rounded bg-negativo px-3 py-1 text-white disabled:opacity-60"
            >
              {pend ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button onClick={() => setConfirmando(false)} className="rounded-lg border border-linha px-3 py-1">
              Voltar
            </button>
          </div>
          {erro && (
            <p role="alert" className="text-xs text-negativo">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
