"use client";
import { useRef, useState } from "react";
import PizZip from "pizzip";
import {
  listarNotasAutorizadasPorCompetencia,
  baixarDanfseNfse,
  baixarXmlNfse,
} from "@/app/(app)/clientes/[id]/nfse";
import { nomeArquivoUnico } from "@/lib/nfse/nomeArquivo";
import { Botao } from "@/components/ui/Botao";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Formato = "pdf" | "xml";

// O DANFSe é baixado ao vivo do ADN nacional (mTLS) e falha de forma intermitente
// em lotes grandes → tenta até 4 vezes com espera crescente antes de desistir.
async function baixarPdfComRetry(nfseId: string): Promise<string | null> {
  const esperas = [0, 500, 1500, 3000]; // 1ª imediata + 3 retentativas
  for (const espera of esperas) {
    if (espera > 0) await sleep(espera);
    const r = await baixarDanfseNfse(nfseId);
    if (r.pdfBase64) return r.pdfBase64;
  }
  return null;
}

export function BaixarNotasZip() {
  const [mes, setMes] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState<Formato | null>(null);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, falha: 0 });
  const [falhas, setFalhas] = useState<string[]>([]);
  const pararRef = useRef(false);
  const competencia = mes ? `${mes}-01` : "";

  async function contar() {
    if (!competencia) return;
    setCarregando(true);
    setTotal(null);
    setFalhas([]);
    const lista = await listarNotasAutorizadasPorCompetencia(competencia);
    setTotal(lista.length);
    setCarregando(false);
  }

  async function baixar(formato: Formato) {
    if (!competencia) return;
    setBaixando(formato);
    setFalhas([]);
    pararRef.current = false;
    const notas = await listarNotasAutorizadasPorCompetencia(competencia);
    setProg({ feitas: 0, total: notas.length, ok: 0, falha: 0 });
    const zip = new PizZip();
    const usados = new Set<string>();
    const falhou: string[] = [];
    let adicionadas = 0;
    for (const nota of notas) {
      if (pararRef.current) break;
      const nome = nomeArquivoUnico(nota.razaoSocial, usados);
      let ok = false;
      if (formato === "pdf") {
        const pdf = await baixarPdfComRetry(nota.nfseId);
        if (pdf) {
          zip.file(`${nome}.pdf`, pdf, { base64: true });
          ok = true;
        }
      } else {
        const xml = await baixarXmlNfse(nota.nfseId);
        if (xml.conteudo) {
          zip.file(`${nome}.xml`, xml.conteudo);
          ok = true;
        }
      }
      if (ok) adicionadas++;
      else falhou.push(nota.razaoSocial);
      setProg((p) => ({ feitas: p.feitas + 1, total: p.total, ok: p.ok + (ok ? 1 : 0), falha: p.falha + (ok ? 0 : 1) }));
      if (formato === "pdf") await sleep(150); // gentil com o ADN entre notas
    }
    if (adicionadas > 0) {
      const blob = zip.generate({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nfse-${formato}-${competencia.slice(0, 7)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setFalhas(falhou);
    setBaixando(null);
  }

  const ocupado = carregando || baixando !== null;

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-5 text-sm">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Baixar notas do mês (ZIP)</h2>
        <p className="text-xs text-cinza">
          Baixa as NFS-e autorizadas da competência, nomeadas pela razão social do cliente. O <strong>PDF (DANFSe)</strong>{" "}
          e o <strong>XML</strong> têm botões separados — o PDF vem do ADN nacional (com retentativa automática); o XML,
          do banco.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-cinza">
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => {
              setMes(e.target.value);
              setTotal(null);
              setFalhas([]);
            }}
            className="ml-2 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto focus:border-verde"
          />
        </label>
        <Botao variante="secundario" onClick={contar} disabled={!competencia || ocupado}>
          {carregando ? "Verificando…" : "Verificar"}
        </Botao>
        {total !== null && !baixando && (
          <>
            <Botao variante="primario" onClick={() => baixar("pdf")} disabled={total === 0}>
              Baixar {total} em PDF
            </Botao>
            <Botao variante="secundario" onClick={() => baixar("xml")} disabled={total === 0}>
              Baixar {total} em XML
            </Botao>
          </>
        )}
        {baixando && (
          <>
            <span className="text-cinza">
              Baixando {baixando.toUpperCase()} {prog.feitas}/{prog.total}… (✓ {prog.ok} · ✗ {prog.falha})
            </span>
            <Botao variante="fantasma" onClick={() => (pararRef.current = true)}>
              Parar
            </Botao>
          </>
        )}
      </div>

      {total === 0 && !baixando && <p className="text-cinza-claro">Nenhuma nota autorizada nessa competência.</p>}

      {falhas.length > 0 && (
        <div className="rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo">
          <p className="font-medium">
            {falhas.length} nota(s) não baixaram (o restante já foi para o ZIP). Tente de novo para reprocessar só estas:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {falhas.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
