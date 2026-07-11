"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirStatusProcesso } from "@/app/(app)/legalizacao/actions";
import type { LegProcStatus } from "@/lib/legalizacao/tipos";

export function AcoesProcesso({ id, status }: { id: string; status: LegProcStatus }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function definir(s: LegProcStatus) {
    setOcupado(true);
    const r = await definirStatusProcesso(id, s);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status !== "concluido" && (
        <button disabled={ocupado} onClick={() => definir("concluido")} className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60">Concluir</button>
      )}
      {status !== "cancelado" && (
        <button disabled={ocupado} onClick={() => definir("cancelado")} className="rounded-lg border border-linha px-3 py-1.5 text-sm text-cinza disabled:opacity-60">Cancelar</button>
      )}
      {status !== "em_andamento" && (
        <button disabled={ocupado} onClick={() => definir("em_andamento")} className="rounded-lg border border-linha px-3 py-1.5 text-sm text-cinza disabled:opacity-60">Reabrir</button>
      )}
    </div>
  );
}
