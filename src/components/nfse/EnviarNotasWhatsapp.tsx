"use client";
import { useRef, useState } from "react";
import { listarNotasParaEnvio, enviarNotaWhatsapp } from "@/app/(app)/nfse/lote/envio";
import { preSelecionadas } from "@/lib/whatsapp/notas-envio";
import { Botao } from "@/components/ui/Botao";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Nota = { nfseId: string; razaoSocial: string; jaEnviada: boolean };

export function EnviarNotasWhatsapp() {
  const [mes, setMes] = useState("");
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, pulados: 0, erros: 0 });
  const [falhas, setFalhas] = useState<Nota[]>([]);
  const pararRef = useRef(false);
  const competencia = mes ? `${mes}-01` : "";

  const visiveis = (notas ?? []).filter((n) => n.razaoSocial.toLowerCase().includes(busca.trim().toLowerCase()));

  async function verificar() {
    if (!competencia) return;
    setCarregando(true);
    setNotas(null);
    setFalhas([]);
    setBusca("");
    const lista = await listarNotasParaEnvio(competencia);
    setNotas(lista);
    setSelecionadas(preSelecionadas(lista));
    setCarregando(false);
  }

  function alternar(id: string) {
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selecionarVisiveis(marcar: boolean) {
    setSelecionadas((s) => {
      const n = new Set(s);
      for (const v of visiveis) {
        if (marcar) n.add(v.nfseId);
        else n.delete(v.nfseId);
      }
      return n;
    });
  }

  async function enviar(alvo: Nota[]) {
    if (alvo.length === 0) return;
    if (!confirm(`Enviar a NFS-e + cobrança para ${alvo.length} cliente(s) por WhatsApp?`)) return;
    setEnviando(true);
    pararRef.current = false;
    setFalhas([]);
    setProg({ feitas: 0, total: alvo.length, ok: 0, pulados: 0, erros: 0 });
    const falhou: Nota[] = [];
    for (const n of alvo) {
      if (pararRef.current) break;
      const r = await enviarNotaWhatsapp(n.nfseId);
      if (r.status === "erro") falhou.push(n);
      setProg((p) => ({
        feitas: p.feitas + 1,
        total: p.total,
        ok: p.ok + (r.status === "ok" ? 1 : 0),
        pulados: p.pulados + (r.status === "pulado" ? 1 : 0),
        erros: p.erros + (r.status === "erro" ? 1 : 0),
      }));
      await sleep(400);
    }
    setFalhas(falhou);
    setEnviando(false);
  }

  const selecionadasList = (notas ?? []).filter((n) => selecionadas.has(n.nfseId));

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-5 text-sm">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Enviar notas + cobrança do mês (WhatsApp)</h2>
        <p className="text-xs text-cinza">
          Escolha as notas e envie a cada cliente a NFS-e (PDF) + os dados de pagamento (PIX/TED). Configure em{" "}
          <strong>Configurações → Dados de pagamento</strong>.
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
              setNotas(null);
              setFalhas([]);
            }}
            className="ml-2 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm text-texto focus:border-verde"
          />
        </label>
        <Botao variante="secundario" onClick={verificar} disabled={!competencia || carregando || enviando}>
          {carregando ? "Verificando…" : "Verificar"}
        </Botao>
        {notas !== null && !enviando && (
          <Botao variante="primario" onClick={() => enviar(selecionadasList)} disabled={selecionadas.size === 0}>
            Enviar {selecionadas.size} selecionada(s)
          </Botao>
        )}
        {enviando && (
          <>
            <span className="text-cinza">
              Enviando {prog.feitas}/{prog.total}… (✓ {prog.ok} · ⤼ {prog.pulados} · ✗ {prog.erros})
            </span>
            <Botao variante="fantasma" onClick={() => (pararRef.current = true)}>
              Parar
            </Botao>
          </>
        )}
      </div>

      {notas !== null && !enviando && (
        <>
          {notas.length === 0 ? (
            <p className="text-cinza-claro">Nenhuma nota autorizada nessa competência.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por razão social…"
                  className="flex-1 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm focus:border-verde"
                />
                <button onClick={() => selecionarVisiveis(true)} className="text-xs text-cinza underline">
                  Selecionar todas
                </button>
                <button onClick={() => selecionarVisiveis(false)} className="text-xs text-cinza underline">
                  Limpar
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-linha">
                {visiveis.map((n) => (
                  <label
                    key={n.nfseId}
                    className="flex cursor-pointer items-center gap-2 border-b border-linha/60 px-3 py-2 last:border-b-0 hover:bg-creme"
                  >
                    <input
                      type="checkbox"
                      checked={selecionadas.has(n.nfseId)}
                      onChange={() => alternar(n.nfseId)}
                      className="accent-verde"
                    />
                    <span className="flex-1 truncate text-texto">{n.razaoSocial}</span>
                    {n.jaEnviada && (
                      <span className="shrink-0 rounded bg-verde/10 px-2 py-0.5 text-[10px] font-medium text-verde">
                        já enviada
                      </span>
                    )}
                  </label>
                ))}
                {visiveis.length === 0 && <p className="px-3 py-2 text-cinza-claro">Nenhuma nota com esse filtro.</p>}
              </div>
            </div>
          )}
        </>
      )}

      {falhas.length > 0 && !enviando && (
        <div className="space-y-2 rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo">
          <p className="font-medium">{falhas.length} não enviada(s) (erro). Reenvie para tentar de novo:</p>
          <ul className="list-disc pl-4">
            {falhas.map((n) => (
              <li key={n.nfseId}>{n.razaoSocial}</li>
            ))}
          </ul>
          <Botao variante="primario" onClick={() => enviar(falhas)}>
            Reenviar as {falhas.length} que falharam
          </Botao>
        </div>
      )}
    </div>
  );
}
