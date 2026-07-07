"use client";
import { useRef, useState } from "react";
import { listarNotasParaEnvio, enviarNotaWhatsapp } from "@/app/(app)/nfse/lote/envio";
import { Botao } from "@/components/ui/Botao";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Nota = { nfseId: string; razaoSocial: string };

export function EnviarNotasWhatsapp() {
  const [mes, setMes] = useState("");
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, pulados: 0, erros: 0 });
  const [falhas, setFalhas] = useState<Nota[]>([]);
  const pararRef = useRef(false);
  const competencia = mes ? `${mes}-01` : "";

  async function verificar() {
    if (!competencia) return;
    setCarregando(true);
    setNotas(null);
    setFalhas([]);
    setNotas(await listarNotasParaEnvio(competencia));
    setCarregando(false);
  }

  async function enviar(alvo?: Nota[]) {
    const lista = alvo ?? notas ?? [];
    if (lista.length === 0) return;
    if (!alvo && !confirm(`Enviar a NFS-e + cobrança para ${lista.length} cliente(s) por WhatsApp?`)) return;
    setEnviando(true);
    pararRef.current = false;
    setFalhas([]);
    setProg({ feitas: 0, total: lista.length, ok: 0, pulados: 0, erros: 0 });
    const falhou: Nota[] = [];
    for (const n of lista) {
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
      await sleep(400); // gentil com o Z-API
    }
    setFalhas(falhou);
    setEnviando(false);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-5 text-sm">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Enviar notas + cobrança do mês (WhatsApp)</h2>
        <p className="text-xs text-cinza">
          Envia para cada cliente com NFS-e autorizada a nota (PDF) + os dados de pagamento (PIX/TED). Não reenvia quem
          já recebeu. Configure os dados em <strong>Configurações → Dados de pagamento</strong>.
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
          <Botao variante="primario" onClick={() => enviar()} disabled={notas.length === 0}>
            Enviar {notas.length} nota(s)
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
      {notas?.length === 0 && !enviando && <p className="text-cinza-claro">Nenhuma nota autorizada nessa competência.</p>}
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
