"use client";
import { useActionState, useState } from "react";
import { emitirComoEmitente, type EstadoEmitente } from "@/app/(app)/clientes/[id]/nfse-emitente";

export function EmitirNfseCliente({ clienteId, ambiente }: { clienteId: string; ambiente: string }) {
  const [estado, action, pend] = useActionState<EstadoEmitente, FormData>(
    emitirComoEmitente.bind(null, clienteId),
    {},
  );
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState("");

  if (estado.ok) return <span className="text-xs text-verde">NFS-e emitida ✓</span>;
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} className="rounded border px-2 py-1 text-xs text-cinza">
        Emitir NFS-e
      </button>
    );

  return (
    <form action={action} className="mt-2 space-y-2 rounded border border-linha p-3 text-sm">
      {ambiente === "homologacao" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">Homologação — sem validade jurídica.</p>
      )}
      <p className="font-medium text-cinza">Tomador</p>
      <div className="grid grid-cols-2 gap-2">
        <input name="tomador_documento" placeholder="CNPJ/CPF" required className="rounded border border-linha px-2 py-1" />
        <input name="tomador_razao_social" placeholder="Razão social" required className="rounded border border-linha px-2 py-1" />
        <input name="tom_cep" placeholder="CEP" required className="rounded border border-linha px-2 py-1" />
        <input name="tom_logradouro" placeholder="Logradouro" required className="rounded border border-linha px-2 py-1" />
        <input name="tom_numero" placeholder="Número" className="rounded border border-linha px-2 py-1" />
        <input name="tom_bairro" placeholder="Bairro" className="rounded border border-linha px-2 py-1" />
        <input name="tom_cidade" placeholder="Cidade" className="rounded border border-linha px-2 py-1" />
        <input name="tom_uf" placeholder="UF" maxLength={2} className="rounded border border-linha px-2 py-1" />
        <input name="tom_cmun" placeholder="Cód. município (IBGE)" className="rounded border border-linha px-2 py-1" />
      </div>
      <p className="font-medium text-cinza">Serviço</p>
      <input
        name="descricao_servico"
        placeholder="Descrição do serviço"
        className="w-full rounded border border-linha px-2 py-1"
      />
      <label className="block">
        Valor (R$)
        <input
          type="number"
          name="valor"
          step="0.01"
          min="0"
          required
          className="ml-2 w-32 rounded border border-linha px-2 py-1"
        />
      </label>
      <label className="block">
        Competência
        <input
          type="month"
          required
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="ml-2 rounded border border-linha px-2 py-1"
        />
      </label>
      <input type="hidden" name="competencia" value={mes ? `${mes}-01` : ""} />
      {estado.erro && (
        <p role="alert" className="text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pend} className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60">
          {pend ? "Emitindo..." : "Emitir"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded border px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
