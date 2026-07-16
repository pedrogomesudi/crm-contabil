"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { abrirSolicitacao } from "./actions";
import { SOLICITACAO_CATEGORIAS } from "@/lib/solicitacoes/solicitacao";

const cls = "rounded-lg border border-linha px-2 py-1.5 text-sm";

export function NovaSolicitacao() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const r = await abrirSolicitacao(new FormData(e.currentTarget));
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.id) router.push(`/portal/solicitacoes/${r.id}`);
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg bg-verde px-3 py-2 text-sm text-white">
        Nova solicitação
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
      <h2 className="font-display text-sm font-semibold text-texto">Nova solicitação</h2>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-cinza">
          Categoria
          <select name="categoria" defaultValue="duvida" className={`mt-0.5 block ${cls}`}>
            {SOLICITACAO_CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-xs text-cinza">
          Assunto
          <input name="assunto" required className={`mt-0.5 block w-full ${cls}`} />
        </label>
      </div>
      <label className="block text-xs text-cinza">
        Descrição
        <textarea name="mensagem" required rows={4} className={`mt-0.5 block w-full ${cls}`} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={ocupado} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
          {ocupado ? "Abrindo…" : "Abrir solicitação"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-cinza underline">
          cancelar
        </button>
        {erro && (
          <span role="alert" className="text-xs text-negativo">
            {erro}
          </span>
        )}
      </div>
    </form>
  );
}
