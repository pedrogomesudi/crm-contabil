"use client";
import { useState, useTransition } from "react";
import { aplicarImportacao } from "@/app/(app)/integracoes/dominio/actions";
import type { ResumoPrevia } from "@/app/(app)/integracoes/dominio/estados";

function Card({ rotulo, n, cor }: { rotulo: string; n: number; cor: string }) {
  return (
    <div className={`rounded-md border p-3 text-center ${cor}`}>
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs">{rotulo}</div>
    </div>
  );
}

export function PreviaImportacao({ resumo }: { resumo: ResumoPrevia }) {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  const aplicar = () =>
    start(async () => {
      const r = await aplicarImportacao(resumo.importacaoId);
      if (r.erro) setMsg(r.erro);
      else {
        setFeito(true);
        setMsg(`Importação aplicada: ${r.gravados} cliente(s) gravado(s).`);
      }
    });

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold">Prévia da importação</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card rotulo="Novos" n={resumo.novos} cor="border-green-200 bg-green-50" />
        <Card rotulo="Atualizados" n={resumo.atualizados} cor="border-yellow-200 bg-yellow-50" />
        <Card rotulo="Inalterados" n={resumo.inalterados} cor="border-gray-200 bg-gray-50" />
        <Card rotulo="Pendências" n={resumo.pendencias} cor="border-purple-200 bg-purple-50" />
      </div>
      {resumo.pendencias > 0 && (
        <p className="text-xs text-gray-600">
          {resumo.pendencias} registro(s) em pendência (regime sem equivalente, documento inválido ou cliente sem
          empresa) não serão gravados — revise no Domínio se necessário.
        </p>
      )}
      {!feito && (
        <button
          onClick={aplicar}
          disabled={pend}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pend ? "Aplicando…" : `Aplicar (${resumo.novos + resumo.atualizados} registros)`}
        </button>
      )}
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}
