"use client";
import { useState } from "react";
import { controleCls } from "@/components/ui/Campo";
import { Botao } from "@/components/ui/Botao";
import { TabelaCartao } from "@/components/ui/TabelaCartao";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import { exportar } from "@/app/(app)/exportar/actions";
import { conferenciaDaCompetencia, relatorioConferencia } from "@/app/(app)/nfse/lote/conferencia";
import type { EntradaConferencia } from "@/lib/nfse/conferencia";
import type { FormatoExportacao } from "@/lib/exportar/tipos";

const brl = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ConferenciaLote() {
  const [mes, setMes] = useState("");
  const [dados, setDados] = useState<EntradaConferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [soDivergentes, setSoDivergentes] = useState(true);
  const competencia = mes ? `${mes}-01` : "";

  async function conferir() {
    if (!competencia) return;
    setCarregando(true);
    setErro(null);
    setDados(null);
    const r = await conferenciaDaCompetencia(competencia);
    if ("erro" in r) setErro(r.erro);
    else setDados(r);
    setCarregando(false);
  }

  // A exportação monta o relatório no servidor: a tela tem as linhas, mas repetir a conta aqui
  // criaria duas versões dela — a planilha precisa dizer exatamente o que a tela diz.
  const exportarConferencia = async (formato: FormatoExportacao) => {
    const rel = await relatorioConferencia(competencia);
    if ("erro" in rel) return rel;
    return exportar(rel, formato);
  };

  const linhas = dados ? (soDivergentes ? dados.linhas.filter((l) => l.impede) : dados.linhas) : [];

  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-5 text-sm">
      <div>
        <h2 className="font-display text-sm font-semibold text-texto">Conferência: financeiro × fiscal</h2>
        <p className="text-xs text-cinza">
          Confronta o <strong>boleto</strong> de cada honorário com a <strong>nota fiscal</strong> da competência, antes
          do envio em lote. Não trava nada: aponta onde os dois lados discordam para você corrigir primeiro.
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
              setDados(null);
              setErro(null);
            }}
            className={`${controleCls()} ml-2`}
          />
        </label>
        <Botao variante="secundario" onClick={conferir} disabled={!competencia || carregando}>
          {carregando ? "Conferindo…" : "Conferir"}
        </Botao>
        {dados && <BotaoExportar acao={exportarConferencia} />}
      </div>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{erro}</p>}

      {dados && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Cartao rotulo="Financeiro (boletos)" valor={brl(dados.totais.financeiro)} />
            <Cartao rotulo="Fiscal (notas)" valor={brl(dados.totais.fiscal)} />
            <Cartao rotulo="Diferença" valor={brl(dados.totais.diferenca)} alerta={dados.totais.diferenca !== 0} />
          </div>

          <p className={`text-xs ${dados.totais.comDivergencia ? "text-red-700" : "text-green-700"}`}>
            {dados.totais.comDivergencia === 0
              ? `✓ ${dados.totais.clientes} clientes conferidos, nenhuma divergência.`
              : `${dados.totais.comDivergencia} de ${dados.totais.clientes} clientes com divergência.`}
          </p>

          <label className="flex items-center gap-1.5 text-xs text-cinza">
            <input type="checkbox" checked={soDivergentes} onChange={(e) => setSoDivergentes(e.target.checked)} />
            Mostrar só quem tem divergência
          </label>

          {linhas.length > 0 && (
            <TabelaCartao>
              <table className="tabela-cartao w-full text-left text-xs">
                <thead className="text-cinza">
                  <tr>
                    <th className="py-1 pr-2">Cliente</th>
                    <th className="py-1 pr-2 text-right">Boleto</th>
                    <th className="py-1 pr-2 text-right">Nota</th>
                    <th className="py-1 pr-2 text-right">Diferença</th>
                    <th className="py-1 pr-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const dif = l.valorNota !== null && l.valorTitulo !== null ? l.valorNota - l.valorTitulo : null;
                    return (
                      <tr key={l.clienteId} className="border-t border-linha align-top">
                        <td className="py-1 pr-2" data-rotulo="Cliente">
                          {l.razaoSocial}
                          {l.grupoNome && <span className="block text-cinza">grupo {l.grupoNome}</span>}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums" data-rotulo="Boleto">
                          {brl(l.valorTitulo)}
                          {l.numeroBoleto !== null && <span className="block text-cinza">nº {l.numeroBoleto}</span>}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums" data-rotulo="Nota">
                          {brl(l.valorNota)}
                          {l.numeroNota !== null && <span className="block text-cinza">nº {l.numeroNota}</span>}
                        </td>
                        <td
                          className={`py-1 pr-2 text-right tabular-nums ${dif ? "font-semibold text-red-700" : ""}`}
                          data-rotulo="Diferença"
                        >
                          {dif === null ? "—" : brl(dif)}
                        </td>
                        <td className="py-1 pr-2" data-rotulo="Situação">
                          {l.situacoes.length === 0 ? (
                            <span className="text-green-700">OK</span>
                          ) : (
                            <span className={l.impede ? "text-red-700" : "text-cinza"}>{l.situacoes.join(" · ")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TabelaCartao>
          )}
        </>
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, alerta = false }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerta ? "border-red-200 bg-red-50" : "border-linha bg-fundo"}`}>
      <p className="text-xs text-cinza">{rotulo}</p>
      <p className={`font-display text-lg font-semibold tabular-nums ${alerta ? "text-red-700" : "text-texto"}`}>
        {valor}
      </p>
    </div>
  );
}
