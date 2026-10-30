"use client";
import { controleCls } from "@/components/ui/Campo";
import { useActionState, useState } from "react";
import { salvarProcuracao, type EstadoVenc } from "@/app/(app)/vencimentos/crud-actions";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";

const input = controleCls();

export function FormProcuracao({ clienteId, substituiId }: { clienteId: string; substituiId?: string }) {
  const [estado, action, pend] = useActionState<EstadoVenc, FormData>(salvarProcuracao.bind(null, clienteId), {});
  const [aberto, setAberto] = useState(false);

  if (estado.ok) return <span className="text-xs text-verde">Procuração salva ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg border border-linha px-2 py-1 text-xs">
        {substituiId ? "Renovar" : "+ Procuração"}
      </button>
    );

  return (
    <form action={action} className="mt-2 rounded-lg border border-linha p-3 text-sm">
      {substituiId && <input type="hidden" name="substitui_id" value={substituiId} />}
      <FormGrid>
        <FormCampo label="Órgão" span={4}>
          <input name="orgao" required placeholder="e-CAC, prefeitura, INSS…" className={`w-full ${input}`} />
        </FormCampo>
        <FormCampo label="Outorgante" span={4}>
          <input name="outorgante" required className={`w-full ${input}`} />
        </FormCampo>
        <FormCampo label="Outorgado" span={4}>
          <input name="outorgado" className={`w-full ${input}`} />
        </FormCampo>
        <FormCampo label="Início" span={3}>
          <input type="date" name="inicio" className={`w-full ${input}`} />
        </FormCampo>
        <FormCampo label="Validade" span={3}>
          <input type="date" name="validade" required className={`w-full ${input}`} />
        </FormCampo>
        <FormCampo label="Observação" span={6}>
          <input name="observacao" className={`w-full ${input}`} />
        </FormCampo>
      </FormGrid>
      {estado.erro && (
        <p role="alert" className="mt-2 text-xs text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="mt-2 flex gap-2">
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
