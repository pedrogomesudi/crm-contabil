"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { reenviarFalhas } from "../actions";

export function Reenviar({ comunicadoId, erros }: { comunicadoId: string; erros: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (erros === 0) return null;

  async function reenviar() {
    setOcupado(true);
    const r = await reenviarFalhas(comunicadoId);
    setOcupado(false);
    if (r.erro) return setMsg(r.erro);
    setMsg(`Reenviados: ${r.enviados ?? 0}. Ainda com erro: ${r.erros ?? 0}.`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={reenviar}
        disabled={ocupado}
        className="rounded-lg border border-linha px-3 py-1.5 text-sm text-cinza disabled:opacity-60"
        title="Só os que falharam — quem já recebeu não recebe de novo"
      >
        {ocupado ? "Reenviando…" : `Reenviar falhas (${erros})`}
      </button>
      {msg && <span className="text-xs text-cinza">{msg}</span>}
    </div>
  );
}
