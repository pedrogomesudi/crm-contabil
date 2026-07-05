"use client";
import { useState, useTransition } from "react";
import { gerarLinkDownload } from "@/app/(app)/documentos/actions";

// Gera uma URL assinada (server-side, registra o acesso) e abre o arquivo.
// A janela é aberta SÍNCRONA no clique (antes do await) para não ser bloqueada
// por bloqueadores de pop-up; depois apontamos a URL assinada.
export function BotaoBaixar({ documentoId, nome }: { documentoId: string; nome: string }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function baixar() {
    setErro(null);
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null; // corta o vínculo opener (anti reverse tabnabbing)
    start(async () => {
      const res = await gerarLinkDownload(documentoId);
      if (res.url) {
        if (win) win.location.href = res.url;
        else window.location.href = res.url; // fallback se o pop-up foi bloqueado
      } else {
        win?.close();
        setErro(res.erro ?? "Falha ao baixar.");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={baixar}
        disabled={pending}
        aria-label={`Baixar ${nome}`}
        className="rounded border border-linha px-2 py-1 text-cinza disabled:opacity-60"
      >
        {pending ? "Gerando..." : "Baixar"}
      </button>
      {erro && (
        <span role="alert" className="text-xs text-negativo">
          {erro}
        </span>
      )}
    </span>
  );
}
