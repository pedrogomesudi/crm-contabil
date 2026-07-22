"use client";
import { useState } from "react";
import { alterarVencimentoTitulo } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { controleCls } from "@/components/ui/Campo";

export function AlterarVencimentoTitulo({
  tituloId,
  vencimento,
  onMudou,
}: {
  tituloId: string;
  vencimento: string;
  onMudou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [novaData, setNovaData] = useState(vencimento);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    setOcupado(true);
    const r = await alterarVencimentoTitulo(tituloId, novaData);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setEditando(false);
    onMudou();
  }

  if (!editando) {
    return (
      <button
        type="button"
        className="ml-2 text-cinza underline"
        onClick={() => {
          setNovaData(vencimento);
          setEditando(true);
        }}
      >
        Alterar vencimento
      </button>
    );
  }
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1">
      <input
        type="date"
        value={novaData}
        onChange={(e) => setNovaData(e.target.value)}
        aria-label="Nova data de vencimento do título"
        className={`${controleCls("compacto")} text-[11px]`}
      />
      <button type="button" onClick={salvar} disabled={ocupado} className="underline">
        Confirmar
      </button>
      <button type="button" onClick={() => setEditando(false)} className="text-cinza-claro underline">
        Cancelar
      </button>
    </span>
  );
}
