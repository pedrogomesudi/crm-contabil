"use client";
import { useState, useTransition } from "react";
import { setOptOutCobranca } from "@/app/(app)/financeiro/regua-cobranca/optout";
import { setAceitaComunicados } from "@/app/(app)/comunicados/actions";

// Um interruptor por canal: desligar o WhatsApp não silencia mais o cliente — o e-mail assume.
// Para não cobrar de jeito nenhum, desligue os dois.
// "Aceita comunicados" é OUTRA finalidade (LGPD): o cliente pode querer receber a fatura e
// não os informativos.
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
  const [wa, setWa] = useState(whatsapp);
  const [em, setEm] = useState(email);
  const [com, setCom] = useState(comunicados);
  const [pend, start] = useTransition();

  const alternar = (canal: "whatsapp" | "email", valor: boolean) =>
    start(async () => {
      const r = await setOptOutCobranca(clienteId, { [canal]: valor });
      if (r.erro) return;
      if (canal === "whatsapp") setWa(valor);
      else setEm(valor);
    });

  return (
    <div className="space-y-1 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={wa} disabled={pend} onChange={() => alternar("whatsapp", !wa)} />
        Cobrar por WhatsApp
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={em} disabled={pend} onChange={() => alternar("email", !em)} />
        Cobrar por e-mail
      </label>
      {!wa && !em && <p className="text-xs text-cinza">Este cliente não receberá cobrança automática.</p>}

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
