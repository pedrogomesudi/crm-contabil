"use client";
import { useState } from "react";
import { baixarBase64 } from "@/lib/lgpd/tipos";
import { exportar } from "@/app/(app)/exportar/actions";
import type { FormatoExportacao, RelatorioExportavel } from "@/lib/exportar/tipos";

const BOTOES: { formato: FormatoExportacao; rotulo: string }[] = [
  { formato: "xlsx", rotulo: "XLSX" },
  { formato: "pdf", rotulo: "PDF" },
  { formato: "csv", rotulo: "CSV" },
];

// Botão único de exportação: a tela passa o relatório já montado (ela tem os dados
// e o gate) e aqui só se pede a serialização e se baixa.
export function BotaoExportar({ relatorio }: { relatorio: RelatorioExportavel }) {
  const [gerando, setGerando] = useState<FormatoExportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar(formato: FormatoExportacao) {
    setGerando(formato);
    setErro(null);
    try {
      const r = await exportar(relatorio, formato);
      if ("erro" in r) return setErro(r.erro);
      baixarBase64(r.base64, r.nome, r.mime);
    } catch {
      setErro("Falha ao gerar o arquivo.");
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {BOTOES.map((b) => (
        <button
          key={b.formato}
          disabled={gerando !== null}
          onClick={() => baixar(b.formato)}
          className="rounded-lg border border-linha px-3 py-1.5 text-xs text-cinza disabled:opacity-60"
        >
          {gerando === b.formato ? "Gerando…" : b.rotulo}
        </button>
      ))}
      {erro && <span className="text-xs text-negativo">{erro}</span>}
    </div>
  );
}
