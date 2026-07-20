"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { controleCls } from "@/components/ui/Campo";
import { formatarMoeda } from "@/lib/format";
import type { ClienteSuspensao } from "./actions";

export function LinhaCliente({
  item,
  acaoLabel,
  onAcao,
}: {
  item: ClienteSuspensao;
  acaoLabel: string;
  onAcao: (clienteId: string, motivo: string) => Promise<{ ok?: boolean; erro?: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setErro("");
    setBusy(true);
    const r = await onAcao(item.clienteId, motivo);
    setBusy(false);
    if (r.ok) {
      setAberto(false);
      setMotivo("");
      router.refresh();
    } else {
      setErro(r.erro ?? "Erro");
    }
  }

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-linha bg-white p-3 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium text-texto">{item.cliente}</span>
        <span className="text-cinza">
          {formatarMoeda(item.saldoDevedor)} · {item.diasAtraso}d
        </span>
      </span>
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} className="w-fit text-verde underline">
          {acaoLabel}
        </button>
      )}
      {aberto && (
        <span className="flex flex-col gap-1">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (obrigatório)"
            className={controleCls("compacto")}
          />
          <span className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={confirmar}
              className="rounded bg-verde px-2 py-0.5 font-medium text-white"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-cinza underline">
              Cancelar
            </button>
          </span>
          {erro && <span className="text-negativo">{erro}</span>}
        </span>
      )}
    </li>
  );
}
