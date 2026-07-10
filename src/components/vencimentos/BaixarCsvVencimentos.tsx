"use client";
import { useState, useTransition } from "react";
import { csvVencimentos } from "@/app/(app)/vencimentos/actions";

export function BaixarCsvVencimentos() {
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pend}
        onClick={() =>
          start(async () => {
            setErro(null);
            const r = await csvVencimentos();
            if (r.erro || !r.csv) {
              setErro(r.erro ?? "Falha ao gerar o CSV.");
              return;
            }
            const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "vencimentos.csv";
            a.click();
            URL.revokeObjectURL(url);
          })
        }
        className="rounded-lg border border-linha px-3 py-1 text-sm text-cinza disabled:opacity-60"
      >
        {pend ? "Gerando…" : "Exportar CSV"}
      </button>
      {erro && (
        <span role="alert" className="text-xs text-negativo">
          {erro}
        </span>
      )}
    </span>
  );
}
