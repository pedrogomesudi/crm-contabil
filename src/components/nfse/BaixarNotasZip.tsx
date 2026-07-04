"use client";
import { useRef, useState } from "react";
import PizZip from "pizzip";
import {
  listarNotasAutorizadasPorCompetencia,
  baixarDanfseNfse,
  baixarXmlNfse,
} from "@/app/(app)/clientes/[id]/nfse";
import { nomeArquivoUnico } from "@/lib/nfse/nomeArquivo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BaixarNotasZip() {
  const [mes, setMes] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, falha: 0 });
  const pararRef = useRef(false);
  const competencia = mes ? `${mes}-01` : "";

  async function contar() {
    if (!competencia) return;
    setCarregando(true);
    setTotal(null);
    const lista = await listarNotasAutorizadasPorCompetencia(competencia);
    setTotal(lista.length);
    setCarregando(false);
  }

  async function baixar() {
    if (!competencia) return;
    setBaixando(true);
    pararRef.current = false;
    const notas = await listarNotasAutorizadasPorCompetencia(competencia);
    setProg({ feitas: 0, total: notas.length, ok: 0, falha: 0 });
    const zip = new PizZip();
    const usados = new Set<string>();
    let adicionadas = 0;
    for (const nota of notas) {
      if (pararRef.current) break;
      const nome = nomeArquivoUnico(nota.razaoSocial, usados);
      const [pdf, xml] = await Promise.all([baixarDanfseNfse(nota.nfseId), baixarXmlNfse(nota.nfseId)]);
      let ok = false;
      if (pdf.pdfBase64) {
        zip.file(`${nome}.pdf`, pdf.pdfBase64, { base64: true });
        ok = true;
      }
      if (xml.conteudo) zip.file(`${nome}.xml`, xml.conteudo);
      if (ok) adicionadas++;
      setProg((p) => ({ feitas: p.feitas + 1, total: p.total, ok: p.ok + (ok ? 1 : 0), falha: p.falha + (ok ? 0 : 1) }));
      await sleep(150); // gentil com o ADN (mTLS)
    }
    if (adicionadas > 0) {
      const blob = zip.generate({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nfse-${competencia.slice(0, 7)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setBaixando(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4 text-sm">
      <div>
        <h2 className="text-sm font-semibold">Baixar notas do mês (ZIP)</h2>
        <p className="text-xs text-slate-600">
          Baixa todas as NFS-e autorizadas da competência escolhida — <strong>PDF (DANFSe) e XML</strong> de cada nota,
          nomeados pela razão social do cliente. O download roda uma a uma, no navegador.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="ml-2 rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <button
          onClick={contar}
          disabled={!competencia || carregando || baixando}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-60"
        >
          {carregando ? "Verificando…" : "Verificar"}
        </button>
        {total !== null && !baixando && (
          <button
            onClick={baixar}
            disabled={total === 0}
            className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60"
          >
            Baixar {total} nota(s) (PDF + XML)
          </button>
        )}
        {baixando && (
          <>
            <span>
              Baixando {prog.feitas}/{prog.total}… (✓ {prog.ok} · ✗ {prog.falha})
            </span>
            <button onClick={() => (pararRef.current = true)} className="rounded border border-slate-300 px-3 py-1">
              Parar
            </button>
          </>
        )}
      </div>
      {total === 0 && !baixando && <p className="text-slate-500">Nenhuma nota autorizada nessa competência.</p>}
    </div>
  );
}
