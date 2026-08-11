"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { prepararDanfse } from "@/app/(app)/nfse/lote/danfse-backfill";

// Baixa (em segundo plano, serializado) os PDFs das notas da competência para o cache, para o
// envio não depender do ADN na hora. Também é o diagnóstico: se o ADN recusa, mostra o motivo.
export function PrepararDanfse() {
  const [mes, setMes] = useState("");
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erros, setErros] = useState<{ motivo: string; qtd: number }[]>([]);
  const competencia = mes ? `${mes}-01` : "";

  async function preparar() {
    if (!competencia) return;
    setRodando(true);
    setErros([]);
    setMsg("Preparando…");
    let totalOk = 0;
    const acc = new Map<string, number>();
    try {
      for (let i = 0; i < 30; i++) {
        const r = await prepararDanfse(competencia);
        totalOk += r.ok;
        for (const e of r.erros) acc.set(e.motivo, (acc.get(e.motivo) ?? 0) + e.qtd);
        setMsg(`Baixadas ${totalOk} nota(s)… ${r.restantes > 0 ? `restam ~${r.restantes}` : "concluído"}`);
        if (r.restantes === 0) break;
        if (r.ok === 0) break; // não progrediu: o que resta o ADN está recusando — para e mostra o motivo
      }
    } catch {
      setMsg("Falha ao preparar as notas.");
    }
    setErros([...acc.entries()].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd));
    setRodando(false);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-5 text-sm">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Preparar notas para envio (baixar PDFs)</h2>
        <p className="text-xs text-cinza">
          Baixa o DANFSe <strong>oficial</strong> do servidor nacional (ADN) para o cache. É opcional: se o ADN estiver
          instável, o envio já funciona com o DANFSe que o próprio SALDO gera a partir do XML autorizado. Use isto para
          guardar o oficial quando o ADN estiver no ar. Pode repetir sem problema.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-cinza">
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={`${controleCls()} ml-2`}
          />
        </label>
        <Botao variante="secundario" onClick={preparar} disabled={!competencia || rodando}>
          {rodando ? "Preparando…" : "Preparar notas"}
        </Botao>
        {msg && <span className="text-cinza">{msg}</span>}
      </div>
      {erros.length > 0 && (
        <div className="space-y-1 rounded-lg border border-atencao/30 bg-atencao-fundo px-3 py-2 text-xs text-atencao">
          <p className="font-medium">O oficial de algumas notas não baixou (o ADN está instável). Motivos:</p>
          <ul className="list-disc pl-4">
            {erros.map((e) => (
              <li key={e.motivo}>
                <strong>{e.qtd}×</strong> {e.motivo}
              </li>
            ))}
          </ul>
          <p className="mt-1 border-t border-atencao/20 pt-1 text-atencao/90">
            Isto <strong>não impede o envio</strong>: as notas sem o oficial em cache saem com o DANFSe que o próprio
            SALDO gera a partir do XML. Tente aqui de novo mais tarde para guardar o oficial.
          </p>
        </div>
      )}
    </div>
  );
}
