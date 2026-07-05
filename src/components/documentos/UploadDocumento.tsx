"use client";
import { useActionState, useEffect, useRef } from "react";
import { anexarDocumento } from "@/app/(app)/documentos/actions";
import type { EstadoUpload } from "@/app/(app)/documentos/estados";
import { Campo, inputCls } from "@/components/ui/Campo";

export function UploadDocumento({ clienteId }: { clienteId: string }) {
  const action = anexarDocumento.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoUpload, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Limpa o campo de arquivo após um envio bem-sucedido.
  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded border border-linha bg-creme p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Arquivo (PDF, PNG ou JPG, até 10 MB)">
          <input
            name="arquivo"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className={inputCls}
          />
        </Campo>
        <Campo label="Tipo (opcional)">
          <input
            name="tipo"
            type="text"
            maxLength={60}
            placeholder="Ex.: Contrato, Balanço"
            className={inputCls}
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
          Documento anexado.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Anexar documento"}
      </button>
    </form>
  );
}
