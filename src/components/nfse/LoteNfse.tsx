"use client";
import { useRef, useState } from "react";
import { listarElegiveisLote, emitirNfseCliente } from "@/app/(app)/clientes/[id]/nfse";
import { montarCsv } from "@/lib/nfse/relatorioLote";
import type { ClienteLote, LinhaRelatorio } from "@/lib/nfse/tipos";
import { mesAnteriorDeHoje } from "@/lib/financeiro/competencia";

type Linha = ClienteLote & {
  marcado: boolean;
  resultado?: string;
  motivo?: string;
  numero?: string;
  chave?: string;
};
const ROTULO: Record<string, string> = { apta: "", ja_emitida: "Já emitida", sem_documento: "Sem CNPJ/CPF" };

export function LoteNfse() {
  // Emissão nos primeiros dias do mês, referente ao serviço do mês anterior.
  const [mes, setMes] = useState(mesAnteriorDeHoje());
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [prog, setProg] = useState({ feitas: 0, total: 0, ok: 0, falha: 0 });
  const pararRef = useRef(false);
  const competencia = mes ? `${mes}-01` : "";

  async function carregar() {
    if (!competencia) return;
    setCarregando(true);
    const lista = await listarElegiveisLote(competencia);
    setLinhas(lista.map((c) => ({ ...c, marcado: c.situacao === "apta" })));
    setCarregando(false);
  }

  async function executar() {
    const alvos = linhas.filter((l) => l.marcado && l.situacao === "apta");
    setExecutando(true);
    pararRef.current = false;
    setProg({ feitas: 0, total: alvos.length, ok: 0, falha: 0 });
    for (let i = 0; i < alvos.length; i++) {
      if (pararRef.current) break;
      const alvo = alvos[i]!;
      setLinhas((ls) => ls.map((l) => (l.clienteId === alvo.clienteId ? { ...l, resultado: "emitindo…" } : l)));
      const r = await emitirNfseCliente(alvo.clienteId, competencia);
      setLinhas((ls) =>
        ls.map((l) =>
          l.clienteId === alvo.clienteId
            ? { ...l, resultado: r.status, motivo: r.motivo, numero: r.numero, chave: r.chave }
            : l,
        ),
      );
      setProg((p) => ({
        feitas: p.feitas + 1,
        total: p.total,
        ok: p.ok + (r.status === "autorizada" ? 1 : 0),
        falha: p.falha + (r.status === "autorizada" ? 0 : 1),
      }));
    }
    setExecutando(false);
  }

  function baixarRelatorio() {
    const rel: LinhaRelatorio[] = linhas.map((l) => ({
      cliente: l.razaoSocial,
      documento: l.documento,
      competencia,
      valor: l.honorario,
      resultado:
        l.resultado === "autorizada"
          ? "Autorizada"
          : l.resultado === "rejeitada"
            ? "Rejeitada"
            : l.resultado === "erro"
              ? "Erro"
              : l.situacao === "ja_emitida"
                ? "Pulada — já emitida"
                : l.situacao === "sem_documento"
                  ? "Pulada — sem CNPJ"
                  : (l.resultado ?? "Não processada"),
      numero: l.numero ?? "",
      chave: l.chave ?? "",
      motivo: l.motivo ?? "",
    }));
    const url = URL.createObjectURL(new Blob([montarCsv(rel)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfse-lote-${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function marcarTodos(marcar: boolean) {
    setLinhas((ls) => ls.map((l) => (l.situacao === "apta" ? { ...l, marcado: marcar } : l)));
  }

  const aptas = linhas.filter((l) => l.situacao === "apta");
  const selecionados = aptas.filter((l) => l.marcado);
  const todasMarcadas = aptas.length > 0 && selecionados.length === aptas.length;
  const totalValor = selecionados.reduce((s, l) => s + l.honorario, 0);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-end gap-2">
        <label>
          Competência
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="ml-2 rounded border border-linha px-2 py-1"
          />
        </label>
        <button
          onClick={carregar}
          disabled={!competencia || carregando}
          className="rounded border border-linha px-3 py-1 disabled:opacity-60"
        >
          {carregando ? "Carregando…" : "Carregar clientes"}
        </button>
      </div>

      {linhas.length > 0 && (
        <>
          <p>
            <strong>{selecionados.length}</strong> nota(s) selecionada(s) · total R$ {totalValor.toFixed(2)}
          </p>
          <div className="max-h-96 overflow-auto rounded border border-linha">
            <table className="w-full">
              <thead className="bg-creme text-left">
                <tr>
                  <th className="p-2">
                    <input
                      type="checkbox"
                      aria-label="Marcar/desmarcar todos"
                      checked={todasMarcadas}
                      disabled={executando || aptas.length === 0}
                      onChange={(e) => marcarTodos(e.target.checked)}
                    />
                  </th>
                  <th className="p-2">Cliente</th>
                  <th className="p-2">Honorário</th>
                  <th className="p-2">Situação / Resultado</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.clienteId} className="border-t border-linha/70">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={l.marcado}
                        disabled={l.situacao !== "apta" || executando}
                        onChange={(e) =>
                          setLinhas((ls) =>
                            ls.map((x) => (x.clienteId === l.clienteId ? { ...x, marcado: e.target.checked } : x)),
                          )
                        }
                      />
                    </td>
                    <td className="p-2">
                      {l.razaoSocial}
                      {!l.temEndereco && l.situacao === "apta" && (
                        <span className="ml-1 text-xs text-atencao">(sem endereço)</span>
                      )}
                    </td>
                    <td className="p-2">R$ {l.honorario.toFixed(2)}</td>
                    <td className="p-2">
                      {l.resultado ? `${l.resultado}${l.motivo ? " — " + l.motivo : ""}` : ROTULO[l.situacao]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={executar}
              disabled={executando || selecionados.length === 0}
              className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
            >
              {executando ? `Emitindo ${prog.feitas}/${prog.total}…` : `Emitir ${selecionados.length} nota(s)`}
            </button>
            {executando && (
              <button onClick={() => (pararRef.current = true)} className="rounded border border-linha px-3 py-1">
                Parar
              </button>
            )}
            {prog.total > 0 && (
              <span>
                ✓ {prog.ok} · ✗ {prog.falha}
              </span>
            )}
            {prog.feitas > 0 && !executando && (
              <button onClick={baixarRelatorio} className="rounded border border-linha px-3 py-1">
                Baixar relatório (CSV)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
