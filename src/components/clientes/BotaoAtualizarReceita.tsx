"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarViaReceita } from "@/app/(app)/integracoes/dominio/receita";

// Atualiza razão social + endereço deste cliente consultando o CNPJ na Receita
// (BrasilAPI, com fallback ReceitaWS). Após gravar, router.refresh() recarrega a
// ficha; o FormCliente remonta pelo key={atualizado_em}, refletindo os dados novos.
export function BotaoAtualizarReceita({ cpfCnpj }: { cpfCnpj: string }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function atualizar() {
    setMsg(null);
    start(async () => {
      const r = await atualizarViaReceita(cpfCnpj);
      if (r.ok) {
        setMsg({ ok: true, texto: `Atualizado pela Receita${r.situacao ? ` · situação ${r.situacao}` : ""}.` });
        router.refresh();
      } else {
        setMsg({ ok: false, texto: r.erro ?? "Falha na consulta." });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={atualizar}
        disabled={pend}
        className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
      >
        {pend ? "Consultando Receita…" : "Atualizar pela Receita Federal"}
      </button>
      {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.texto}</span>}
    </div>
  );
}
