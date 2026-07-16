"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { responderSolicitacao } from "../actions";

type Msg = { id: string; corpo: string; criadoEm: string; minha: boolean };

const quando = (iso: string) => {
  const d = iso.slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${iso.slice(11, 16)}`;
};

export function Thread({ solicitacaoId, mensagens }: { solicitacaoId: string; mensagens: Msg[] }) {
  const router = useRouter();
  const [corpo, setCorpo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    if (!corpo.trim()) return;
    setOcupado(true);
    const r = await responderSolicitacao(solicitacaoId, corpo);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    setCorpo("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {mensagens.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl p-3 text-sm ${m.minha ? "ml-auto bg-verde/15" : "bg-white border border-linha"}`}
          >
            <p className="whitespace-pre-wrap text-texto">{m.corpo}</p>
            <p className="mt-1 text-xs text-cinza">
              {m.minha ? "Você" : "Escritório"} · {quando(m.criadoEm)}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          rows={2}
          placeholder="Escreva uma mensagem…"
          className="flex-1 rounded-lg border border-linha px-2 py-1.5 text-sm"
        />
        <button
          disabled={ocupado || !corpo.trim()}
          onClick={enviar}
          className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
