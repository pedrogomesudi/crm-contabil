"use client";
import { useEffect } from "react";
import type { MsgConversa } from "@/lib/whatsapp/inbox";
import { iconeDeMime } from "@/lib/whatsapp/midia";

// A cor do selo do documento por tipo (usa o brand kit).
const COR_SELO: Record<string, string> = {
  PDF: "bg-negativo",
  DOC: "bg-[#2f80ed]",
  XLS: "bg-verde",
  ARQ: "bg-cinza",
  IMG: "bg-cinza",
  AUDIO: "bg-cinza",
};

export function Midia({
  msg,
  onAbrirImagem,
}: {
  msg: MsgConversa;
  onAbrirImagem: (url: string, nome: string) => void;
}) {
  if (!msg.midiaTipo || !msg.midiaPath) return null;
  // Fallback: se a URL assinada não veio (evento Realtime / erro ao assinar), usa o proxy.
  const src = msg.midiaUrl ?? `/api/atendimento/midia/${msg.id}`;
  const nome = msg.midiaNome ?? "arquivo";

  if (msg.midiaTipo === "image") {
    return (
      <button
        type="button"
        onClick={() => onAbrirImagem(src, nome)}
        className="block overflow-hidden rounded-xl"
        aria-label={`Abrir imagem ${nome}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={nome} className="h-[170px] w-60 object-cover transition hover:brightness-95" />
      </button>
    );
  }

  if (msg.midiaTipo === "audio") {
    // Áudio de voz do WhatsApp não tem legendas; a regra de caption não se aplica.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls src={src} className="w-64 max-w-full" />;
  }

  // documento
  const selo = iconeDeMime(msg.midiaMime);
  return (
    <a
      href={`/api/atendimento/midia/${msg.id}`}
      download={nome}
      className="flex w-64 items-center gap-3 rounded-xl border border-linha bg-white px-3 py-2.5 text-texto hover:bg-creme"
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white ${COR_SELO[selo]}`}
      >
        {selo}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{nome}</span>
      <span aria-hidden className="text-cinza-claro">
        ⤓
      </span>
    </a>
  );
}

export function Lightbox({ url, nome, onFechar }: { url: string; nome: string; onFechar: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Imagem ${nome}`}
    >
      {/* Backdrop clicável (fecha ao clicar fora). É um <button> de tela cheia — acessível e sem
          violar a regra de handler em elemento não-interativo. O conteúdo fica por cima. */}
      <button type="button" onClick={onFechar} aria-label="Fechar imagem" className="absolute inset-0 cursor-default" />
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar"
        className="absolute right-5 top-4 z-10 text-2xl text-white/80 hover:text-white"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nome} className="pointer-events-none relative max-h-full max-w-full rounded-lg" />
      <a href={url} download={nome} className="absolute bottom-5 z-10 text-sm text-white/80 hover:text-white">
        {nome} · baixar ⤓
      </a>
    </div>
  );
}
