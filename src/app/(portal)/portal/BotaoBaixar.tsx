"use client";
import { useState } from "react";

// Abre a URL assinada numa nova aba. A action decide (via RLS) se o arquivo é mesmo
// do cliente logado — o id sozinho nunca é suficiente.
export function BotaoBaixar({
  id,
  acao,
  rotulo = "baixar",
}: {
  id: string;
  acao: (id: string) => Promise<{ url?: string; erro?: string }>;
  rotulo?: string;
}) {
  const [ocupado, setOcupado] = useState(false);
  async function baixar() {
    setOcupado(true);
    const r = await acao(id);
    setOcupado(false);
    if (r.erro || !r.url) return alert(r.erro ?? "Não foi possível gerar o link.");
    window.open(r.url, "_blank", "noopener,noreferrer");
  }
  return (
    <button disabled={ocupado} onClick={baixar} className="text-xs text-verde underline disabled:opacity-60">
      {ocupado ? "gerando…" : rotulo}
    </button>
  );
}
