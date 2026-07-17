"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import { relatorioDRE } from "./dre-actions";
import type { DRE, GrupoDRE } from "@/lib/financeiro/dre";
import type { TipoPeriodo } from "@/lib/financeiro/orcado-realizado";

const TIPOS: { id: TipoPeriodo; label: string }[] = [
  { id: "mes", label: "Mês" },
  { id: "trimestre", label: "Trimestre" },
  { id: "semestre", label: "Semestre" },
  { id: "ano", label: "Ano" },
];
const MESES_NOME = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function opcoesIndice(tipo: TipoPeriodo): { valor: number; label: string }[] {
  if (tipo === "mes") return MESES_NOME.map((m, i) => ({ valor: i + 1, label: m }));
  if (tipo === "trimestre") return [1, 2, 3, 4].map((t) => ({ valor: t, label: `${t}º trimestre` }));
  if (tipo === "semestre") return [1, 2].map((s) => ({ valor: s, label: `${s}º semestre` }));
  return [{ valor: 1, label: "Ano inteiro" }];
}

function Grupo({ titulo, grupo, negativo }: { titulo: string; grupo: GrupoDRE; negativo?: boolean }) {
  const sinal = negativo ? "-" : "";
  const cls = negativo ? "text-negativo" : "";
  return (
    <>
      <tr>
        <td colSpan={2} className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-cinza">
          {titulo}
        </td>
      </tr>
      {grupo.linhas.length === 0 && (
        <tr>
          <td colSpan={2} className="px-3 py-1 text-xs text-cinza-claro">
            —
          </td>
        </tr>
      )}
      {grupo.linhas.map((l) => (
        <tr key={l.nome}>
          <td className="px-3 py-1 text-texto">{l.nome}</td>
          <td className={`px-3 py-1 text-right tabular-nums ${cls}`}>
            {sinal}
            {formatarMoeda(l.valor)}
          </td>
        </tr>
      ))}
      <tr className="font-medium">
        <td className="px-3 py-1 text-texto">Total {titulo.toLowerCase()}</td>
        <td className={`px-3 py-1 text-right tabular-nums ${cls}`}>
          {sinal}
          {formatarMoeda(grupo.total)}
        </td>
      </tr>
    </>
  );
}

export function RelatorioDRE({
  ano: anoIni,
  tipo: tipoIni,
  indice: indiceIni,
  base: baseIni,
  dre: dreIni,
}: {
  ano: number;
  tipo: TipoPeriodo;
  indice: number;
  base: "competencia" | "caixa";
  dre: DRE | null;
}) {
  const [ano, setAno] = useState(anoIni);
  const [tipo, setTipo] = useState<TipoPeriodo>(tipoIni);
  const [indice, setIndice] = useState(indiceIni);
  const [base, setBase] = useState<"competencia" | "caixa">(baseIni);
  const [dre, setDre] = useState<DRE | null>(dreIni);
  const [carregando, setCarregando] = useState(false);

  async function recarregar(next: {
    ano?: number;
    tipo?: TipoPeriodo;
    indice?: number;
    base?: "competencia" | "caixa";
  }) {
    const a = next.ano ?? ano;
    const t = next.tipo ?? tipo;
    let i = next.indice ?? indice;
    if (next.tipo && next.tipo !== "mes" && i > (next.tipo === "trimestre" ? 4 : next.tipo === "semestre" ? 2 : 1))
      i = 1;
    const b = next.base ?? base;
    setAno(a);
    setTipo(t);
    setIndice(i);
    setBase(b);
    setCarregando(true);
    const r = await relatorioDRE(a, t, i, b);
    setDre(r?.dre ?? null);
    setCarregando(false);
  }

  const sel = controleCls("compacto");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={tipo} onChange={(e) => recarregar({ tipo: e.target.value as TipoPeriodo })} className={sel}>
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={indice}
          onChange={(e) => recarregar({ indice: Number(e.target.value) })}
          className={sel}
          disabled={tipo === "ano"}
        >
          {opcoesIndice(tipo).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={ano}
          onChange={(e) => recarregar({ ano: Number(e.target.value) })}
          className={`${sel} w-24`}
        />
        <select
          value={base}
          onChange={(e) => recarregar({ base: e.target.value as "competencia" | "caixa" })}
          className={sel}
        >
          <option value="competencia">Competência</option>
          <option value="caixa">Caixa</option>
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white"
        >
          Imprimir
        </button>
      </div>

      {!dre ? (
        <p className="text-sm text-cinza">{carregando ? "Carregando…" : "Sem dados."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <tbody>
              <Grupo titulo="Receita operacional" grupo={dre.receitaOperacional} />
              <Grupo titulo="Despesa operacional" grupo={dre.despesaOperacional} negativo />
              <tr className="border-t-2 border-linha font-semibold">
                <td className="px-3 py-2 text-texto">Resultado operacional</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${dre.resultadoOperacional >= 0 ? "text-verde" : "text-negativo"}`}
                >
                  {formatarMoeda(dre.resultadoOperacional)}
                </td>
              </tr>
              <Grupo titulo="Receita não operacional" grupo={dre.receitaNaoOperacional} />
              <Grupo titulo="Despesa não operacional" grupo={dre.despesaNaoOperacional} negativo />
              <tr className="border-t-2 border-tinta font-bold">
                <td className="px-3 py-2 text-texto">Resultado líquido</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${dre.resultadoLiquido >= 0 ? "text-verde" : "text-negativo"}`}
                >
                  {formatarMoeda(dre.resultadoLiquido)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
