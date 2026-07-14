"use client";
import { useState, useTransition } from "react";
import { setOptOutCobranca } from "@/app/(app)/financeiro/regua-cobranca/optout";

// Um interruptor por canal: desligar o WhatsApp não silencia mais o cliente — o e-mail assume.
// Para não cobrar de jeito nenhum, desligue os dois.
export function OptOutCobranca({
  clienteId,
  whatsapp,
  email,
}: {
  clienteId: string;
  whatsapp: boolean;
  email: boolean;
}) {
  const [wa, setWa] = useState(whatsapp);
  const [em, setEm] = useState(email);
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
    </div>
  );
}
