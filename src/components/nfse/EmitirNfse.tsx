"use client";
import { useActionState, useState } from "react";
import { emitirNfse, type EstadoNfse } from "@/app/(app)/clientes/[id]/nfse";
import { mesAnteriorDeHoje } from "@/lib/financeiro/competencia";

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
  const [mes, setMes] = useState(mesAnteriorDeHoje());

  if (estado.ok) return <span className="text-xs text-verde">NFS-e emitida ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-1 text-xs text-cinza">
        Emitir NFS-e
      </button>
    );

  return (
    <form action={action} className="mt-2 space-y-2 rounded border border-linha p-3 text-sm">
      {ambiente === "homologacao" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">Homologação — sem validade jurídica.</p>
      )}
      <label className="block">
        Valor (R$)
        <input
          type="number"
          name="valor"
          step="0.01"
          min="0"
          defaultValue={honorario.toFixed(2)}
          required
          className="ml-2 w-32 rounded border border-linha px-2 py-1"
        />
      </label>
      <label className="block">
        Descrição do serviço
        <input
          name="descricao"
          placeholder="Honorarios"
          className="ml-2 w-64 rounded border border-linha px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="avulsa" />
        Nota avulsa (serviço extra) — não conta como a recorrente do mês
      </label>
      <label className="block">
        Competência
        <input
          type="month"
          required
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="ml-2 rounded border border-linha px-2 py-1"
        />
      </label>
      <input type="hidden" name="competencia" value={mes ? `${mes}-01` : ""} />
      {estado.erro && (
        <p role="alert" className="text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pend}
          className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
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
