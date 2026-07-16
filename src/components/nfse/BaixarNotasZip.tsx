"use client";
import { useRef, useState } from "react";
import PizZip from "pizzip";
import {
  listarNotasAutorizadasPorCompetencia,
  baixarDanfseNfse,
  baixarXmlNfse,
  type NotaParaDownload,
} from "@/app/(app)/clientes/[id]/nfse";
import { nomeArquivoUnico } from "@/lib/nfse/nomeArquivo";
import { Botao } from "@/components/ui/Botao";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Formato = "pdf" | "xml";

// O DANFSe vem ao vivo do ADN nacional, que retorna 502 esporádico e 429 (limite
// de taxa). Retry paciente: 5 tentativas com espera crescente até ~18s por nota.
async function baixarPdfComRetry(nfseId: string): Promise<string | null> {
  const esperas = [0, 1000, 2500, 5000, 10000];
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
  const [falhas, setFalhas] = useState<NotaParaDownload[]>([]);
  const ultimoFormato = useRef<Formato>("pdf");
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

  // notasAlvo: se informado, reprocessa só essas; senão, todas da competência.
  async function baixar(formato: Formato, notasAlvo?: NotaParaDownload[]) {
    if (!competencia) return;
    setBaixando(formato);
    ultimoFormato.current = formato;
    setFalhas([]);
    pararRef.current = false;
    const notas = notasAlvo ?? (await listarNotasAutorizadasPorCompetencia(competencia));
    setProg({ feitas: 0, total: notas.length, ok: 0, falha: 0 });
    const zip = new PizZip();
    // Nomes calculados aqui (sequencial, determinístico) para evitar corrida na dedup.
    const usados = new Set<string>();
    const fila = notas.map((nota) => ({ nota, nome: nomeArquivoUnico(nota.razaoSocial, usados) }));
    const falhou: NotaParaDownload[] = [];
    let adicionadas = 0;

    // Pool de concorrência: rápido quando vem do cache; o retry cobre eventual ADN.
    let proximo = 0;
    const CONCORRENCIA = 4;
    async function worker() {
      while (!pararRef.current) {
        const i = proximo++;
        if (i >= fila.length) return;
        const { nota, nome } = fila[i]!;
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
        else falhou.push(nota);
        setProg((p) => ({
          feitas: p.feitas + 1,
          total: p.total,
          ok: p.ok + (ok ? 1 : 0),
          falha: p.falha + (ok ? 0 : 1),
        }));
      }
    }
    await Promise.all(Array.from({ length: CONCORRENCIA }, worker));

    if (adicionadas > 0) {
      const blob = zip.generate({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sufixo = notasAlvo ? "-reprocesso" : "";
      a.download = `nfse-${formato}-${competencia.slice(0, 7)}${sufixo}.zip`;
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
          Baixa as NFS-e autorizadas da competência, nomeadas pela razão social do cliente.{" "}
          <strong>PDF (DANFSe)</strong> e <strong>XML</strong> em botões separados. Os PDFs ficam em cache — a 1ª baixa
          do mês busca no ADN nacional (com retentativa); as seguintes são instantâneas.
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

      {falhas.length > 0 && !baixando && (
        <div className="space-y-2 rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo">
          <p className="font-medium">
            {falhas.length} nota(s) não baixaram (o restante já foi para o ZIP) — o ADN nacional recusou (502/429).
          </p>
          <ul className="list-disc pl-4">
            {falhas.map((n) => (
              <li key={n.nfseId}>{n.razaoSocial}</li>
            ))}
          </ul>
          <Botao variante="primario" onClick={() => baixar(ultimoFormato.current, falhas)}>
            Rebaixar só estas {falhas.length}
          </Botao>
        </div>
      )}
    </div>
  );
}
