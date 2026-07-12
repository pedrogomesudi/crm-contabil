"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { gerarTermoAcervo } from "@/app/(app)/legalizacao/actions";
import { ACERVO_PADRAO } from "@/lib/legalizacao/termo";

export function TermoAcervo({ processoId, hoje, responsavelPadrao }: { processoId: string; hoje: string; responsavelPadrao: string }) {
  const router = useRouter();
  const [data, setData] = useState(hoje);
  const [responsavel, setResponsavel] = useState(responsavelPadrao);
  const [itens, setItens] = useState(ACERVO_PADRAO.join("\n"));
  const [ocupado, setOcupado] = useState(false);

  async function gerar() {
    setOcupado(true);
    const r = await gerarTermoAcervo(processoId, { itens: itens.split("\n"), data, responsavel: responsavel || null });
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    if (r.pdfBase64 && r.nome) {
      const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nome;
      a.click();
      URL.revokeObjectURL(url);
    }
    router.refresh();
  }

  return (
    <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
      <h2 className="font-display text-sm font-semibold text-texto">Termo de entrega (NBC PG 01)</h2>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-cinza">Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
        <label className="flex-1 text-xs text-cinza">Responsável
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
        </label>
      </div>
      <label className="block text-xs text-cinza">Itens do acervo (um por linha)
        <textarea value={itens} onChange={(e) => setItens(e.target.value)} rows={8} className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm" />
      </label>
      <button disabled={ocupado} onClick={gerar} className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60">
        {ocupado ? "Gerando…" : "Gerar termo (PDF)"}
      </button>
      <p className="text-xs text-cinza">O termo é baixado e também anexado aos Documentos do cliente.</p>
    </section>
  );
}
