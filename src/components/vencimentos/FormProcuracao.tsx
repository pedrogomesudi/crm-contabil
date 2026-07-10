"use client";
import { useActionState, useState } from "react";
import { salvarProcuracao, type EstadoVenc } from "@/app/(app)/vencimentos/crud-actions";

const input = "rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto";

export function FormProcuracao({ clienteId, substituiId }: { clienteId: string; substituiId?: string }) {
  const [estado, action, pend] = useActionState<EstadoVenc, FormData>(
    salvarProcuracao.bind(null, clienteId),
    {},
  );
  const [aberto, setAberto] = useState(false);

  if (estado.ok) return <span className="text-xs text-verde">Procuração salva ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg border border-linha px-2 py-1 text-xs">
        {substituiId ? "Renovar" : "+ Procuração"}
      </button>
    );

  return (
    <form action={action} className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-linha p-3 text-sm">
      {substituiId && <input type="hidden" name="substitui_id" value={substituiId} />}
      <label className="block">
        Órgão
        <input name="orgao" required placeholder="e-CAC, prefeitura, INSS…" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Outorgante
        <input name="outorgante" required className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Outorgado
        <input name="outorgado" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Início
        <input type="date" name="inicio" className={`mt-1 w-full ${input}`} />
      </label>
      <label className="block">
        Validade
        <input type="date" name="validade" required className={`mt-1 w-full ${input}`} />
      </label>
      <label className="col-span-2 block">
        Observação
        <input name="observacao" className={`mt-1 w-full ${input}`} />
      </label>
      {estado.erro && (
        <p role="alert" className="col-span-2 text-xs text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="col-span-2 flex gap-2">
        <button disabled={pend} className="rounded-lg bg-verde px-3 py-1 text-white disabled:opacity-60">
          {pend ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-linha px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
