"use client";
import { useState, useTransition } from "react";
import { definirCanalCobranca } from "@/app/(app)/financeiro/regua-cobranca/optout";
import { setAceitaComunicados } from "@/app/(app)/comunicados/actions";
import { SeletorCanalCobranca } from "@/components/clientes/SeletorCanalCobranca";
import { flagsParaCanal } from "@/lib/clientes/canal-cobranca";

// Canal de cobrança (WhatsApp/E-mail/Ambos) + a permissão de comunicados (finalidade LGPD
// distinta). O canal grava os dois flags via definirCanalCobranca.
export function OptOutCobranca({
  clienteId,
  whatsapp,
  email,
  comunicados,
}: {
  clienteId: string;
  whatsapp: boolean;
  email: boolean;
  comunicados: boolean;
}) {
  const [com, setCom] = useState(comunicados);
  const [pend, start] = useTransition();
  const canalInicial = flagsParaCanal({ whatsapp, email });

  return (
    <div className="space-y-2 text-sm">
      <SeletorCanalCobranca
        inicial={canalInicial}
        onSelecionar={(c) => definirCanalCobranca(clienteId, c).then(() => undefined)}
      />
      <label className="flex items-center gap-2 border-t border-linha pt-2">
        <input
          type="checkbox"
          checked={com}
          disabled={pend}
          onChange={() =>
            start(async () => {
              const r = await setAceitaComunicados(clienteId, !com);
              if (!r.erro) setCom(!com);
            })
          }
        />
        Aceita comunicados (avisos de legislação e prazos)
      </label>
    </div>
  );
}
