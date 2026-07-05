"use client";
import { useActionState } from "react";
import { importarEnderecos } from "@/app/(app)/integracoes/dominio/actions";
import type { EstadoEnderecos } from "@/app/(app)/integracoes/dominio/estados";

export function ImportarEnderecos() {
  const [estado, action, pend] = useActionState<EstadoEnderecos, FormData>(importarEnderecos, {});
  return (
    <form action={action} className="space-y-3 rounded-lg border border-gray-200 p-4">
      <div>
        <h2 className="text-sm font-semibold">Atualizar endereços</h2>
        <p className="text-xs text-gray-600">
          Envie o relatório <strong>Empresas — Dados Cadastrais</strong> (.xls). O endereço dos
          clientes é preenchido casando por CNPJ. (O relatório de Regime não traz endereço completo.)
        </p>
      </div>
      <input name="arquivo" type="file" accept=".xls" required className="block w-full text-sm" />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="sobrescrever" className="h-4 w-4" />
        Sobrescrever endereços já preenchidos
      </label>
      <button
        type="submit"
        disabled={pend}
        className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-50"
      >
        {pend ? "Processando…" : "Atualizar endereços"}
      </button>
      {estado.erro && (
        <p role="alert" className="text-sm text-negativo">
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="text-sm text-verde">
          {estado.preenchidos} preenchido(s)
          {estado.atualizados ? ` · ${estado.atualizados} atualizado(s)` : ""}
          {estado.mantidos ? ` · ${estado.mantidos} mantido(s)` : ""}
          {estado.semCliente ? ` · ${estado.semCliente} do arquivo sem cliente` : ""}.
        </p>
      )}
    </form>
  );
}
