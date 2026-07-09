"use client";
import { useState } from "react";
import { paraCSV } from "@/lib/financeiro/csv";
import { listarLancamentos, listarBaixas, type LancamentoRow, type BaixaRow, type TipoFiltro } from "./extrato-actions";

type Visao = "lancamentos" | "baixas";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const csvMoeda = (v: number) => v.toFixed(2).replace(".", ",");
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const tipoLabel = (t: string) => (t === "RECEBER" ? "Receber" : "Pagar");

function baixar(nome: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function Extrato({ categorias, inicio: iniIni, fim: fimIni, lancamentosIni }: { categorias: { id: string; nome: string }[]; inicio: string; fim: string; lancamentosIni: LancamentoRow[] }) {
  const [visao, setVisao] = useState<Visao>("lancamentos");
  const [inicio, setInicio] = useState(iniIni);
  const [fim, setFim] = useState(fimIni);
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  const [categoriaId, setCategoriaId] = useState("");
  const [busca, setBusca] = useState("");
  const [lancamentos, setLancamentos] = useState<LancamentoRow[]>(lancamentosIni);
  const [baixas, setBaixas] = useState<BaixaRow[]>([]);
  const [carregando, setCarregando] = useState(false);

  async function recarregar(next: { visao?: Visao; inicio?: string; fim?: string; tipo?: TipoFiltro; categoriaId?: string }) {
    const v = next.visao ?? visao;
    const i = next.inicio ?? inicio;
    const f = next.fim ?? fim;
    const t = next.tipo ?? tipo;
    const c = next.categoriaId ?? categoriaId;
    setVisao(v);
    setInicio(i);
    setFim(f);
    setTipo(t);
    setCategoriaId(c);
    setCarregando(true);
    if (v === "lancamentos") setLancamentos(await listarLancamentos(i, f, t, c || null));
    else setBaixas(await listarBaixas(i, f, t));
    setCarregando(false);
  }

  const q = busca.trim().toLowerCase();
  const lancFiltrados = lancamentos.filter((r) => !q || r.cliente.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q));
  const baixasFiltradas = baixas.filter((r) => !q || r.cliente.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q));

  function exportar() {
    if (visao === "lancamentos") {
      const csv = paraCSV(
        ["Cliente", "Tipo", "Descrição", "Categoria", "Competência", "Vencimento", "Valor", "Baixado", "Status"],
        lancFiltrados.map((r) => [r.cliente, tipoLabel(r.tipo), r.descricao, r.categoria, dataBR(r.competencia), dataBR(r.vencimento), csvMoeda(r.valor), csvMoeda(r.baixado), r.status]),
      );
      baixar(`extrato-lancamentos-${inicio}-${fim}.csv`, csv);
    } else {
      const csv = paraCSV(
        ["Data", "Cliente", "Tipo", "Valor recebido", "Forma", "Conta", "Descrição"],
        baixasFiltradas.map((r) => [dataBR(r.data), r.cliente, tipoLabel(r.tipo), csvMoeda(r.valor), r.forma, r.conta, r.descricao]),
      );
      baixar(`extrato-baixas-${inicio}-${fim}.csv`, csv);
    }
  }

  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-linha p-0.5 text-sm">
          <button type="button" onClick={() => recarregar({ visao: "lancamentos" })} className={`rounded px-2 py-0.5 ${visao === "lancamentos" ? "bg-verde text-white" : "text-cinza"}`}>
            Lançamentos
          </button>
          <button type="button" onClick={() => recarregar({ visao: "baixas" })} className={`rounded px-2 py-0.5 ${visao === "baixas" ? "bg-verde text-white" : "text-cinza"}`}>
            Baixas
          </button>
        </div>
        <input type="date" value={inicio} onChange={(e) => recarregar({ inicio: e.target.value })} className={inp} />
        <input type="date" value={fim} onChange={(e) => recarregar({ fim: e.target.value })} className={inp} />
        <select value={tipo} onChange={(e) => recarregar({ tipo: e.target.value as TipoFiltro })} className={inp}>
          <option value="todos">Todos</option>
          <option value="RECEBER">Receber</option>
          <option value="PAGAR">Pagar</option>
        </select>
        {visao === "lancamentos" && (
          <select value={categoriaId} onChange={(e) => recarregar({ categoriaId: e.target.value })} className={inp}>
            <option value="">Toda categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" className={inp} />
        <button type="button" onClick={exportar} className="ml-auto rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          {visao === "lancamentos" ? (
            <>
              <thead>
                <tr className="border-b border-linha text-left text-xs text-cinza">
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-right font-medium">Baixado</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {lancFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-3 text-cinza">
                      {carregando ? "Carregando…" : "Sem movimentações no período."}
                    </td>
                  </tr>
                )}
                {lancFiltrados.map((r) => (
                  <tr key={r.id} className="border-b border-linha/60">
                    <td className="px-3 py-1.5 text-texto">{r.cliente}</td>
                    <td className="px-3 py-1.5">{tipoLabel(r.tipo)}</td>
                    <td className="px-3 py-1.5">{r.descricao}</td>
                    <td className="px-3 py-1.5">{r.categoria}</td>
                    <td className="px-3 py-1.5">{dataBR(r.vencimento)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{brl(r.valor)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{brl(r.baixado)}</td>
                    <td className="px-3 py-1.5">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr className="border-b border-linha text-left text-xs text-cinza">
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Forma</th>
                  <th className="px-3 py-2 font-medium">Conta</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {baixasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-cinza">
                      {carregando ? "Carregando…" : "Sem movimentações no período."}
                    </td>
                  </tr>
                )}
                {baixasFiltradas.map((r) => (
                  <tr key={r.id} className="border-b border-linha/60">
                    <td className="px-3 py-1.5">{dataBR(r.data)}</td>
                    <td className="px-3 py-1.5 text-texto">{r.cliente}</td>
                    <td className="px-3 py-1.5">{tipoLabel(r.tipo)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{brl(r.valor)}</td>
                    <td className="px-3 py-1.5">{r.forma}</td>
                    <td className="px-3 py-1.5">{r.conta}</td>
                    <td className="px-3 py-1.5">{r.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}
