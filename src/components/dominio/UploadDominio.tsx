"use client";
import { useActionState } from "react";
import { gerarPrevia } from "@/app/(app)/integracoes/dominio/actions";
import type { EstadoPrevia } from "@/app/(app)/integracoes/dominio/estados";
import { PreviaImportacao } from "./PreviaImportacao";

export function UploadDominio() {
  const [estado, action, pendente] = useActionState<EstadoPrevia, FormData>(gerarPrevia, {});
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3 rounded-lg border border-gray-200 p-4">
        <label htmlFor="arquivos" className="block text-sm font-medium">
          Arquivos exportados do Domínio (Empresas, Clientes, Contratos)
        </label>
        <input
          id="arquivos"
          name="arquivos"
          type="file"
          accept=".xls"
          multiple
          required
          className="block w-full text-sm"
        />
        <button
          type="submit"
          disabled={pendente}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pendente ? "Lendo arquivos…" : "Gerar prévia"}
        </button>
        {estado.erro && (
          <p role="alert" className="text-sm text-red-600">
            {estado.erro}
          </p>
        )}
      </form>
      {estado.resumo && <PreviaImportacao resumo={estado.resumo} />}
    </div>
  );
}
