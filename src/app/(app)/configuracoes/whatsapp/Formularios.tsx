"use client";
import { useActionState, useState, useTransition } from "react";
import { salvarConfigWhatsapp, testarConexao, type EstadoWa } from "./actions";

export function FormWhatsapp({ instance, configurado }: { instance: string; configurado: boolean }) {
  const [estado, action, pend] = useActionState<EstadoWa, FormData>(salvarConfigWhatsapp, {});
  const [teste, setTeste] = useState<string | null>(null);
  const [pendT, start] = useTransition();
  return (
    <div className="space-y-4">
      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠️ O Z-API é <strong>não-oficial</strong> (usa o WhatsApp Web). Use um <strong>número dedicado</strong> do
        escritório — há risco de banimento do número.
      </p>
      <form action={action} className="space-y-3">
        <label className="block text-sm">
          <span className="text-cinza">Instance ID</span>
          <input name="instance" defaultValue={instance} required className="mt-1 w-full rounded-lg border border-linha bg-white p-2 text-sm text-texto focus:border-verde" />
        </label>
        <label className="block text-sm">
          <span className="text-cinza">Token da instância {configurado && "(configurado — reenvie para trocar)"}</span>
          <input name="token" type="password" required className="mt-1 w-full rounded-lg border border-linha bg-white p-2 text-sm text-texto focus:border-verde" />
        </label>
        <label className="block text-sm">
          <span className="text-cinza">Client-Token (segurança da conta)</span>
          <input name="client_token" type="password" required className="mt-1 w-full rounded-lg border border-linha bg-white p-2 text-sm text-texto focus:border-verde" />
        </label>
        {estado.erro && <p className="text-sm text-negativo">{estado.erro}</p>}
        {estado.ok && <p className="text-sm text-verde">Salvo.</p>}
        <button type="submit" disabled={pend} className="rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60">
          {pend ? "Salvando…" : "Salvar"}
        </button>
      </form>
      <button
        onClick={() =>
          start(async () => {
            const r = await testarConexao();
            setTeste(r.erro ?? (r.conectado ? "Conectado ✓" : "Não conectado (leia o QR no Z-API)"));
          })
        }
        disabled={pendT}
        className="rounded border border-linha px-4 py-2 text-sm"
      >
        {pendT ? "Testando…" : "Testar conexão"}
      </button>
      {teste && <p className="text-sm text-cinza">{teste}</p>}
    </div>
  );
}
