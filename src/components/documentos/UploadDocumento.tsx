"use client";
import { useActionState, useEffect, useRef } from "react";
import { anexarDocumento } from "@/app/(app)/documentos/actions";
import type { EstadoUpload } from "@/app/(app)/documentos/estados";
import { Campo, controleCls } from "@/components/ui/Campo";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";

type TipoAtivo = { id: string; nome: string; departamento: string | null };

export function UploadDocumento({ clienteId, tipos }: { clienteId: string; tipos: TipoAtivo[] }) {
  const action = anexarDocumento.bind(null, clienteId);
  const [estado, formAction, pending] = useActionState<EstadoUpload, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Limpa o campo de arquivo após um envio bem-sucedido.
  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded border border-linha bg-creme p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Arquivo (PDF, PNG ou JPG, até 10 MB)">
          <input
            name="arquivo"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className={`${controleCls()} w-full`}
          />
        </Campo>
        {tipos.length > 0 ? (
          <Campo label="Tipo (opcional)">
            <select name="tipo_id" defaultValue="" className={`${controleCls()} w-full`}>
              <option value="">— tipo —</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <Campo label="Tipo (opcional)">
            <input
              name="tipo"
              type="text"
              maxLength={60}
              placeholder="Ex.: Contrato, Balanço"
              className={`${controleCls()} w-full`}
            />
          </Campo>
        )}
        <Campo label="Departamento (opcional)">
          <select name="departamento" defaultValue="" className={`${controleCls()} w-full`}>
            <option value="">— usar o do tipo —</option>
            {DEPARTAMENTOS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Competência (opcional)">
          <input name="competencia" type="month" className={`${controleCls()} w-full`} />
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
