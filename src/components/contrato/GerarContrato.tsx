"use client";
import { useActionState } from "react";
import { gerarContrato, type EstadoContrato } from "@/app/(app)/clientes/[id]/contrato";

export function GerarContrato({ clienteId, hoje }: { clienteId: string; hoje: string }) {
  const action = gerarContrato.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoContrato, FormData>(action, {});
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Gerar contrato</h2>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-700">Início da vigência</span>
          <input
            type="date"
            name="vigencia_inicio"
            defaultValue={hoje}
            required
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Gerando..." : "Gerar Word + PDF"}
        </button>
      </form>
      {estado.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <div role="status" className="text-sm text-green-700">
          Contrato gerado e salvo nos Documentos abaixo.
          {estado.avisos?.map((a) => (
            <span key={a} className="block text-amber-700">
              ⚠️ {a}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
