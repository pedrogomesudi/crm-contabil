"use client";
import { useState } from "react";
import { emitirBoleto, type BoletoView } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";

export function BoletoTitulo({ tituloId, boleto, onMudou }: { tituloId: string; boleto: BoletoView | null; onMudou: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  async function emitir() {
    setOcupado(true);
    const r = await emitirBoleto(tituloId);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    onMudou();
  }
  function copiar(txt: string) {
    void navigator.clipboard?.writeText(txt);
  }
  if (!boleto) {
    return (
      <button type="button" disabled={ocupado} onClick={emitir} className="text-xs text-verde underline">
        Emitir boleto
      </button>
    );
  }
  return (
    <div className="space-y-0.5 text-[11px] text-cinza">
      {boleto.linhaDigitavel && (
        <button type="button" onClick={() => copiar(boleto.linhaDigitavel!)} className="block text-left underline">
          Linha digitável: {boleto.linhaDigitavel.slice(0, 12)}… (copiar)
        </button>
      )}
      {boleto.pixCopiaCola && (
        <button type="button" onClick={() => copiar(boleto.pixCopiaCola!)} className="block text-left underline">
          PIX copia-e-cola (copiar)
        </button>
      )}
      {boleto.urlPdf && (
        <a href={boleto.urlPdf} target="_blank" rel="noreferrer" className="block underline">PDF</a>
      )}
      <span className="block">Boleto #{boleto.numero} · {boleto.status}</span>
    </div>
  );
}
