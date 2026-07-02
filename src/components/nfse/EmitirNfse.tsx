"use client";
import { useActionState, useState } from "react";
import { emitirNfse, type EstadoNfse } from "@/app/(app)/clientes/[id]/nfse";

export function EmitirNfse({
  clienteId,
  honorario,
  ambiente,
}: {
  clienteId: string;
  honorario: number;
  ambiente: string;
}) {
  const [estado, action, pend] = useActionState<EstadoNfse, FormData>(emitirNfse.bind(null, clienteId), {});
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState("");

  if (estado.ok) return <span className="text-xs text-green-700">NFS-e emitida ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-1 text-xs text-slate-700">
        Emitir NFS-e
      </button>
    );

  return (
    <form action={action} className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
      {ambiente === "homologacao" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">Homologação — sem validade jurídica.</p>
      )}
      <p>
        Valor (honorário): <strong>R$ {honorario.toFixed(2)}</strong>
      </p>
      <label className="block">
        Competência
        <input
          type="month"
          required
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="ml-2 rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <input type="hidden" name="competencia" value={mes ? `${mes}-01` : ""} />
      {estado.erro && (
        <p role="alert" className="text-red-600">
          {estado.erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pend}
          className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60"
        >
          {pend ? "Emitindo..." : "Emitir"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded border px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
