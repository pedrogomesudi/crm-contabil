"use client";
import { useEffect, useState, useTransition, useCallback } from "react";
import { listarConversas, abrirConversa, responder } from "./actions";
import type { Conversa, MsgConversa } from "@/lib/whatsapp/inbox";

export function Inbox({ inicial }: { inicial: Conversa[] }) {
  const [conversas, setConversas] = useState<Conversa[]>(inicial);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MsgConversa[]>([]);
  const [texto, setTexto] = useState("");
  const [pend, start] = useTransition();

  const recarregarLista = useCallback(() => {
    start(async () => setConversas(await listarConversas()));
  }, []);

  const abrir = (tel: string) =>
    start(async () => {
      setAtiva(tel);
      setMsgs(await abrirConversa(tel));
      setConversas(await listarConversas());
    });

  // polling ~15s: atualiza a lista e a thread aberta
  useEffect(() => {
    const id = setInterval(() => {
      start(async () => {
        setConversas(await listarConversas());
        if (ativa) setMsgs(await abrirConversa(ativa));
      });
    }, 15000);
    return () => clearInterval(id);
  }, [ativa]);

  const enviar = () =>
    start(async () => {
      if (!ativa || !texto.trim()) return;
      const r = await responder(ativa, texto);
      if (!r.erro) {
        setTexto("");
        setMsgs(await abrirConversa(ativa));
      }
    });

  return (
    <div className="grid h-[70vh] grid-cols-[18rem_1fr] gap-3 text-sm">
      <aside className="overflow-auto rounded-2xl border border-linha bg-white">
        <div className="flex items-center justify-between border-b border-linha/70 p-2">
          <span className="font-semibold">Conversas</span>
          <button onClick={recarregarLista} disabled={pend} className="text-xs text-cinza-claro underline">atualizar</button>
        </div>
        {conversas.map((c) => (
          <button
            key={c.telefone}
            onClick={() => abrir(c.telefone)}
            className={`block w-full border-b border-linha/70 p-2 text-left ${ativa === c.telefone ? "bg-creme" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.cliente ?? c.telefone}</span>
              {c.nao_lidas > 0 && <span className="rounded-full bg-verde px-2 text-xs font-medium text-white">{c.nao_lidas}</span>}
            </div>
            <div className="truncate text-xs text-cinza-claro">{c.ultima}</div>
          </button>
        ))}
        {conversas.length === 0 && <p className="p-2 text-cinza-claro">Nenhuma conversa.</p>}
      </aside>

      <section className="flex flex-col rounded-2xl border border-linha bg-white">
        {ativa ? (
          <>
            <div className="flex-1 space-y-2 overflow-auto p-3">
              {msgs.map((m, i) => (
                <div key={i} className={`max-w-[70%] rounded-2xl px-3 py-2 ${m.direcao === "OUT" ? "ml-auto bg-verde/15 text-texto" : "bg-creme text-texto"}`}>
                  {m.texto}
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-linha/70 p-2">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enviar();
                }}
                placeholder="Responder…"
                className="flex-1 rounded-lg border border-linha bg-white p-2 text-sm text-texto focus:border-verde"
              />
              <button onClick={enviar} disabled={pend} className="rounded-lg bg-verde px-4 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60">Enviar</button>
            </div>
          </>
        ) : (
          <p className="m-auto text-cinza-claro">Selecione uma conversa.</p>
        )}
      </section>
    </div>
  );
}
