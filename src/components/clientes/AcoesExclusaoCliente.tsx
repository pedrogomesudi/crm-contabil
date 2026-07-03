"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirCliente, restaurarCliente } from "@/app/(app)/clientes/actions";
import { formatarData } from "@/lib/format";

export function AcoesExclusaoCliente({
  clienteId,
  excluidoEm,
}: {
  clienteId: string;
  excluidoEm: string | null;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();

  // Cliente excluído: faixa de aviso + Restaurar.
  if (excluidoEm) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        <span className="text-amber-900">Cliente excluído em {formatarData(excluidoEm)}.</span>
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
            className="rounded border border-amber-400 px-3 py-1 text-amber-900 disabled:opacity-60"
          >
            {pend ? "Restaurando…" : "Restaurar"}
          </button>
          {erro && (
            <p role="alert" className="text-xs text-red-600">
              {erro}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Cliente ativo: botão Excluir com confirmação inline (sem window.confirm).
  return (
    <div className="rounded border border-slate-200 p-3 text-sm">
      {!confirmando ? (
        <button
          onClick={() => setConfirmando(true)}
          className="rounded border border-red-300 px-3 py-1 text-red-700"
        >
          Excluir cliente
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-slate-700">
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
              className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-60"
            >
              {pend ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button onClick={() => setConfirmando(false)} className="rounded border px-3 py-1">
              Voltar
            </button>
          </div>
          {erro && (
            <p role="alert" className="text-xs text-red-600">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
