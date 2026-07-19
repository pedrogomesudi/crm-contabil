"use client";
import { useState, useTransition } from "react";
import { definirComunicacaoLegalizacao } from "@/app/(app)/clientes/[id]/legalizacao-pref";

export function OptOutLegalizacao({ clienteId, ligado }: { clienteId: string; ligado: boolean }) {
  const [on, setOn] = useState(ligado);
  const [pend, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={pend}
        onChange={() =>
          start(async () => {
            const r = await definirComunicacaoLegalizacao(clienteId, !on);
            if (!r.erro) setOn(!on);
          })
        }
      />
      Avisar automaticamente o andamento da legalização
    </label>
  );
}
