"use client";
import { useState } from "react";
import { baixarBase64 } from "@/lib/lgpd/tipos";
import { exportar } from "@/app/(app)/exportar/actions";
import type {
  ArquivoExportado,
  FormatoExportacao,
  RelatorioExportavel,
} from "@/lib/exportar/tipos";

const BOTOES: { formato: FormatoExportacao; rotulo: string }[] = [
  { formato: "xlsx", rotulo: "XLSX" },
  { formato: "pdf", rotulo: "PDF" },
  { formato: "csv", rotulo: "CSV" },
];

// Dois modos. No comum, a tela passa o `relatorio` já montado — ela tem os dados e o
// gate, e aqui só se pede a serialização. Quando o relatório NÃO cabe no que a tela
// tem em mãos (a lista de clientes é truncada em 100 e a exportação quer a carteira
// inteira), a tela passa uma `acao`: uma server action que monta e serializa lá,
// evitando trazer milhares de linhas ao cliente só para devolvê-las ao servidor.
type Props =
  | { relatorio: RelatorioExportavel; acao?: never }
  | {
      acao: (formato: FormatoExportacao) => Promise<ArquivoExportado | { erro: string }>;
      relatorio?: never;
    };

export function BotaoExportar({ relatorio, acao }: Props) {
  const [gerando, setGerando] = useState<FormatoExportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar(formato: FormatoExportacao) {
    setGerando(formato);
    setErro(null);
    try {
      const r = acao ? await acao(formato) : await exportar(relatorio, formato);
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
