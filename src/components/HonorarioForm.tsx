"use client";
import { useActionState } from "react";
import { salvarHonorario } from "@/app/(app)/clientes/actions";
import type { EstadoHonorario } from "@/app/(app)/clientes/estados";
import { Campo, inputCls } from "@/components/ui/Campo";
import { FAIXAS_FATURAMENTO, FAIXA_LABEL } from "@/lib/financeiro/tipos";

export type ExtensaoFinanceiraForm = {
  dia_vencimento: number | null;
  qtd_funcionarios: number | null;
  faixa_faturamento: string | null;
  data_saida: string | null;
};

export function HonorarioForm({
  clienteId,
  valorAtual,
  extensao,
}: {
  clienteId: string;
  valorAtual: number | null;
  extensao: ExtensaoFinanceiraForm;
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Dia de vencimento (1–28)">
          <input
            name="dia_vencimento"
            type="number"
            min={1}
            max={28}
            defaultValue={extensao.dia_vencimento ?? ""}
            className={`${inputCls} w-32`}
          />
        </Campo>
        <Campo label="Qtd. funcionários">
          <input
            name="qtd_funcionarios"
            type="number"
            min={0}
            defaultValue={extensao.qtd_funcionarios ?? ""}
            className={`${inputCls} w-32`}
          />
        </Campo>
        <Campo label="Faixa de faturamento">
          <select
            name="faixa_faturamento"
            defaultValue={extensao.faixa_faturamento ?? ""}
            className={inputCls}
          >
            <option value="">—</option>
            {FAIXAS_FATURAMENTO.map((f) => (
              <option key={f} value={f}>
                {FAIXA_LABEL[f]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Data de saída">
          <input
            name="data_saida"
            type="date"
            defaultValue={extensao.data_saida ?? ""}
            className={inputCls}
          />
        </Campo>
      </div>
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
