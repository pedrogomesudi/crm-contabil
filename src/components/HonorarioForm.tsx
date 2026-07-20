"use client";
import { useActionState, useState } from "react";
import { salvarHonorario } from "@/app/(app)/clientes/actions";
import type { EstadoHonorario } from "@/app/(app)/clientes/estados";
import { Campo, controleCls } from "@/components/ui/Campo";
import { FAIXAS_FATURAMENTO, FAIXA_LABEL } from "@/lib/financeiro/tipos";

export type ExtensaoFinanceiraForm = {
  dia_vencimento: number | null;
  qtd_funcionarios: number | null;
  faixa_faturamento: string | null;
  data_saida: string | null;
  indice_reajuste: string | null;
  percentual_reajuste: number | null;
  tem_honorarios_recorrentes: boolean;
};

export function HonorarioForm({
  clienteId,
  valorAtual,
  extensao,
  temContratoAtivo,
}: {
  clienteId: string;
  valorAtual: number | null;
  extensao: ExtensaoFinanceiraForm;
  temContratoAtivo: boolean;
}) {
  const action = salvarHonorario.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoHonorario, FormData>(action, {});
  const [recorrente, setRecorrente] = useState(extensao.tem_honorarios_recorrentes);
  const valorBR = valorAtual != null ? valorAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Honorário</h2>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="tem_honorarios_recorrentes"
          checked={recorrente}
          onChange={(e) => setRecorrente(e.target.checked)}
        />
        Cliente tem honorários recorrentes
      </label>
      {!recorrente && <p className="text-xs text-cinza">Cliente sem cobrança recorrente — só avulsa.</p>}
      {!recorrente && temContratoAtivo && (
        <p role="alert" className="text-xs text-negativo">
          Este cliente tem contrato ativo, mas está marcado como não-recorrente — não gerará mensalidade.
        </p>
      )}
      <Campo label="Honorário mensal (R$)">
        <input
          name="honorario_mensal"
          type="text"
          inputMode="decimal"
          defaultValue={valorBR}
          placeholder="0,00"
          disabled={!recorrente}
          className={`${controleCls()} w-48`}
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
            className={`${controleCls()} w-32`}
          />
        </Campo>
        <Campo label="Qtd. funcionários">
          <input
            name="qtd_funcionarios"
            type="number"
            min={0}
            defaultValue={extensao.qtd_funcionarios ?? ""}
            className={`${controleCls()} w-32`}
          />
        </Campo>
        <Campo label="Faixa de faturamento">
          <select
            name="faixa_faturamento"
            defaultValue={extensao.faixa_faturamento ?? ""}
            className={`${controleCls()} w-full`}
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
            className={`${controleCls()} w-full`}
          />
        </Campo>
        <Campo label="Índice de reajuste">
          <select
            name="indice_reajuste"
            defaultValue={extensao.indice_reajuste ?? "SALARIO_MINIMO"}
            className={`${controleCls()} w-full`}
          >
            <option value="SALARIO_MINIMO">Salário mínimo</option>
            <option value="IPCA">IPCA</option>
            <option value="IGPM">IGP-M</option>
            <option value="INPC">INPC</option>
            <option value="PERCENTUAL_FIXO">Percentual fixo</option>
            <option value="SEM_REAJUSTE">Sem reajuste</option>
          </select>
        </Campo>
        <Campo label="Percentual fixo (%) — só p/ 'Percentual fixo'">
          <input
            name="percentual_reajuste"
            inputMode="decimal"
            defaultValue={extensao.percentual_reajuste != null ? String(extensao.percentual_reajuste) : ""}
            className={`${controleCls()} w-full`}
          />
        </Campo>
      </div>
      {estado.erro && (
        <p role="alert" className="text-sm text-negativo">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="text-sm text-verde">
          Honorário salvo.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar honorário"}
      </button>
    </form>
  );
}
