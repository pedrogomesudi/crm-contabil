"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cadastrarWebhookInter } from "./actions";

export function BotaoWebhook() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function cadastrar() {
    setMsg("");
    setBusy(true);
    const r = await cadastrarWebhookInter();
    setBusy(false);
    setMsg(r.ok ? "Webhook cadastrado no Inter." : (r.erro ?? "Erro"));
    if (r.ok) router.refresh();
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={cadastrar}
        className="rounded-lg border border-linha px-3 py-1 text-sm text-cinza hover:bg-creme disabled:opacity-60"
      >
        Cadastrar webhook no Inter
      </button>
      {msg && <span className="text-xs text-cinza">{msg}</span>}
    </span>
  );
}
