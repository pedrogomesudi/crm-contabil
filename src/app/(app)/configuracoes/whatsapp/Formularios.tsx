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
          <span className="text-slate-700">Instance ID</span>
          <input name="instance" defaultValue={instance} required className="mt-1 w-full rounded border border-slate-300 p-2" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Token da instância {configurado && "(configurado — reenvie para trocar)"}</span>
          <input name="token" type="password" required className="mt-1 w-full rounded border border-slate-300 p-2" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Client-Token (segurança da conta)</span>
          <input name="client_token" type="password" required className="mt-1 w-full rounded border border-slate-300 p-2" />
        </label>
        {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
        {estado.ok && <p className="text-sm text-green-700">Salvo.</p>}
        <button type="submit" disabled={pend} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60">
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
        className="rounded border border-slate-300 px-4 py-2 text-sm"
      >
        {pendT ? "Testando…" : "Testar conexão"}
      </button>
      {teste && <p className="text-sm text-slate-700">{teste}</p>}
    </div>
  );
}
