"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { linhaParaMsg, rotearEvento, type LinhaMensagemRaw } from "@/lib/whatsapp/realtime";
import type { MsgConversa } from "@/lib/whatsapp/inbox";

// Tempo real do atendimento (Supabase Realtime). Assina os INSERT/UPDATE de whatsapp_mensagem com o
// client AUTENTICADO do browser — o Realtime aplica a RLS, então um contador não recebe mensagem de
// cliente alheio. O canal é assinado uma vez (deps []); refs dão ao callback os valores atuais sem
// reconectar a cada render.
export function useRealtimeAtendimento(opts: {
  telefoneAtivo: string | null;
  onMensagemNaConversa: (msg: MsgConversa) => void;
  onListaMudou: () => void;
}): { conectado: boolean } {
  const [conectado, setConectado] = useState(false);
  const ref = useRef(opts);
  const idsThread = useRef<Set<string>>(new Set());

  // Mantém a ref com os valores atuais (telefoneAtivo/callbacks) sem re-assinar o canal a cada
  // render. Atualizar a ref num effect, não no corpo, é o que o react-hooks/lint exige.
  useEffect(() => {
    ref.current = opts;
  });

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const canal = supabase
      .channel("atendimento")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_mensagem" }, (payload) => {
        const raw = payload.new as LinhaMensagemRaw;
        const { paraThread, listaMudou } = rotearEvento(raw, ref.current.telefoneAtivo, idsThread.current);
        if (paraThread) {
          idsThread.current.add(raw.id);
          ref.current.onMensagemNaConversa(linhaParaMsg(raw));
        }
        if (listaMudou) ref.current.onListaMudou();
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_mensagem" },
        () => ref.current.onListaMudou(), // status entregue→lido: o refetch traz o tick novo
      )
      .subscribe((status) => setConectado(status === "SUBSCRIBED"));

    // aba que dormiu: ao voltar, força um refetch (o WebSocket pode ter perdido eventos).
    const aoVoltar = () => {
      if (document.visibilityState === "visible") ref.current.onListaMudou();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      supabase.removeChannel(canal);
    };
  }, []);

  // quando a conversa aberta muda, zera o dedup de ids da thread.
  useEffect(() => {
    idsThread.current = new Set();
  }, [opts.telefoneAtivo]);

  return { conectado };
}
