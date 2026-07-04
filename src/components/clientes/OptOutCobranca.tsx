"use client";
import { useState, useTransition } from "react";
import { setOptOutCobranca } from "@/app/(app)/financeiro/regua-cobranca/optout";

export function OptOutCobranca({ clienteId, ativo }: { clienteId: string; ativo: boolean }) {
  const [on, setOn] = useState(ativo);
  const [pend, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={pend}
        onChange={() =>
          start(async () => {
            const r = await setOptOutCobranca(clienteId, !on);
            if (!r.erro) setOn(!on);
          })
        }
      />
      Receber cobrança por WhatsApp
    </label>
  );
}
