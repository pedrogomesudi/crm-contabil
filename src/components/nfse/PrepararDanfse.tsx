"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { prepararDanfse } from "@/app/(app)/nfse/lote/danfse-backfill";

// Gera (em segundo plano, serializado) os PDFs das notas da competência e os guarda no cache,
// para o envio em lote sair na hora. Desde a NT 008/2026 o ADN não entrega mais o oficial — o
// DANFSe gerado pelo SALDO a partir do XML autorizado (layout v2.0) É o oficial.
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
        setMsg(`Geradas ${totalOk} nota(s)… ${r.restantes > 0 ? `restam ~${r.restantes}` : "concluído"}`);
        if (r.restantes === 0) break;
        if (r.ok === 0) break; // não progrediu: o que resta está falhando — para e mostra o motivo
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
        <h2 className="font-display text-sm font-semibold text-texto">Preparar notas para envio (gerar PDFs)</h2>
        <p className="text-xs text-cinza">
          Gera o DANFSe (layout <strong>oficial v2.0</strong>) a partir do XML autorizado e guarda no sistema, para o
          envio em lote sair na hora. É opcional — o envio também gera sob demanda. Pode repetir sem problema.
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
          <p className="font-medium">Algumas notas não puderam ser geradas. Motivos:</p>
          <ul className="list-disc pl-4">
            {erros.map((e) => (
              <li key={e.motivo}>
                <strong>{e.qtd}×</strong> {e.motivo}
              </li>
            ))}
          </ul>
          <p className="mt-1 border-t border-atencao/20 pt-1 text-atencao/90">
            Em geral é o XML da nota ainda não disponível ou o serviço de PDF momentaneamente indisponível. Isso{" "}
            <strong>não impede o envio</strong>: a nota é gerada sob demanda na hora do envio. Tente aqui de novo mais
            tarde.
          </p>
        </div>
      )}
    </div>
  );
}
