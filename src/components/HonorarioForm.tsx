"use client";
import { useActionState } from "react";
import { salvarHonorario } from "@/app/(app)/clientes/actions";
import type { EstadoHonorario } from "@/app/(app)/clientes/estados";

export function HonorarioForm({
  clienteId,
  valorAtual,
}: {
  clienteId: string;
  valorAtual: number | null;
}) {
  const action = salvarHonorario.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoHonorario, FormData>(action, {});
  return (
    <form
      action={formAction}
      className="max-w-2xl space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-900">Honorário</h2>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-700">Honorário mensal (R$)</span>
        <input
          name="honorario_mensal"
          type="text"
          inputMode="decimal"
          defaultValue={valorAtual ?? ""}
          placeholder="0,00"
          className="w-48 rounded border border-slate-300 px-3 py-2 text-slate-900"
        />
      </label>
      {estado.erro && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="text-sm text-green-700">
          Honorário salvo.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar honorário"}
      </button>
    </form>
  );
}
