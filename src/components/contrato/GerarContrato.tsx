"use client";
import { useActionState } from "react";
import { gerarContrato, type EstadoContrato } from "@/app/(app)/clientes/[id]/contrato";

export function GerarContrato({ clienteId, hoje }: { clienteId: string; hoje: string }) {
  const action = gerarContrato.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoContrato, FormData>(action, {});
  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Gerar contrato</h2>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-cinza">Início da vigência</span>
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
          className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          {pending ? "Gerando..." : "Gerar Word + PDF"}
        </button>
      </form>
      {estado.erro && (
        <p role="alert" className="text-sm text-negativo">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <div role="status" className="text-sm text-verde">
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
