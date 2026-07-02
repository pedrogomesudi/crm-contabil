"use client";
import { useState } from "react";
import { baixarDanfseNfse, baixarXmlNfse } from "@/app/(app)/clientes/[id]/nfse";

function baixarBlob(conteudo: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function BaixarNfse({ nfseId, numero, chave }: { nfseId: string; numero: string; chave: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<"pdf" | "xml" | null>(null);
  const base = `nfse-${numero || chave.slice(-6)}`;

  async function pdf() {
    setCarregando("pdf");
    setErro(null);
    const r = await baixarDanfseNfse(nfseId);
    setCarregando(null);
    if (r.erro || !r.pdfBase64) {
      setErro(r.erro ?? "Falha ao baixar o DANFSe.");
      return;
    }
    const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
    baixarBlob(bytes, `${base}.pdf`, "application/pdf");
  }

  async function xml() {
    setCarregando("xml");
    setErro(null);
    const r = await baixarXmlNfse(nfseId);
    setCarregando(null);
    if (r.erro || !r.conteudo) {
      setErro(r.erro ?? "Falha ao baixar o XML.");
      return;
    }
    baixarBlob(r.conteudo, `${base}.xml`, "application/xml");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={pdf} disabled={!!carregando} className="rounded border px-2 py-0.5 text-xs disabled:opacity-60">
        {carregando === "pdf" ? "..." : "DANFSe (PDF)"}
      </button>
      <button onClick={xml} disabled={!!carregando} className="rounded border px-2 py-0.5 text-xs disabled:opacity-60">
        {carregando === "xml" ? "..." : "XML"}
      </button>
      <a
        href="https://www.nfse.gov.br/consultapublica"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-700 underline"
      >
        portal
      </a>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </div>
  );
}
