"use client";
import { useActionState } from "react";
import { salvarHonorario } from "@/app/(app)/clientes/actions";
import type { EstadoHonorario } from "@/app/(app)/clientes/estados";
import { Campo, inputCls } from "@/components/ui/Campo";

export function HonorarioForm({
  clienteId,
  valorAtual,
}: {
  clienteId: string;
  valorAtual: number | null;
}) {
  const action = salvarHonorario.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoHonorario, FormData>(action, {});
  const valorBR =
    valorAtual != null ? valorAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  return (
    <form
      action={formAction}
      className="max-w-2xl space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-900">Honorário</h2>
      <Campo label="Honorário mensal (R$)">
        <input
          name="honorario_mensal"
          type="text"
          inputMode="decimal"
          defaultValue={valorBR}
          placeholder="0,00"
          className={`${inputCls} w-48`}
        />
      </Campo>
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
