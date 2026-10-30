"use client";
import { controleCls } from "@/components/ui/Campo";
import { useActionState, useState } from "react";
import { salvarCertificado, type EstadoVenc } from "@/app/(app)/vencimentos/crud-actions";
import { FormGrid, FormCampo } from "@/components/ui/FormGrid";

const input = controleCls();

export function FormCertificado({ clienteId, substituiId }: { clienteId: string; substituiId?: string }) {
  const [estado, action, pend] = useActionState<EstadoVenc, FormData>(salvarCertificado.bind(null, clienteId), {});
  const [aberto, setAberto] = useState(false);

  if (estado.ok) return <span className="text-xs text-verde">Certificado salvo ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg border border-linha px-2 py-1 text-xs">
        {substituiId ? "Renovar" : "+ Certificado"}
      </button>
    );

  return (
    <form action={action} className="mt-2 rounded-lg border border-linha p-3 text-sm">
      {substituiId && <input type="hidden" name="substitui_id" value={substituiId} />}
      <FormGrid>
        <FormCampo label="Tipo" span={2}>
          <select name="tipo" defaultValue="A1" className={`w-full ${input}`}>
            <option value="A1">A1</option>
            <option value="A3">A3</option>
          </select>
        </FormCampo>
        <FormCampo label="Titular" span={5}>
          <input name="titular" required className={`w-full ${input}`} />
        </FormCampo>
        <FormCampo label="CNPJ/CPF do titular" span={5}>
          <input name="documento_titular" className={`w-full ${input}`} />
        </FormCampo>
        <FormCampo label="Emissão" span={3}>
          <input type="date" name="emissao" className={`w-full ${input}`} />
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
