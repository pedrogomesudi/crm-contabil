"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { dashboardOrcadoRealizado, type BaseRegime } from "./actions";
import type { Comparativo, CategoriaRef, TipoPeriodo, LinhaComparativo } from "@/lib/financeiro/orcado-realizado";
import { BarrasCategoria } from "./BarrasCategoria";
import { LinhaEvolucao } from "./LinhaEvolucao";
import { formatarMoeda } from "@/lib/format";

const MESES_NOME = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const TIPOS: { id: TipoPeriodo; label: string }[] = [
  { id: "mes", label: "Mês" },
  { id: "trimestre", label: "Trimestre" },
  { id: "semestre", label: "Semestre" },
  { id: "ano", label: "Ano" },
];

function favoravel(natureza: "RECEITA" | "DESPESA", varAbs: number) {
  return natureza === "DESPESA" ? varAbs <= 0 : varAbs >= 0;
}
function pctTxt(pct: number | null) {
  return pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function opcoesIndice(tipo: TipoPeriodo): { valor: number; label: string }[] {
  if (tipo === "mes") return MESES_NOME.map((m, i) => ({ valor: i + 1, label: m }));
  if (tipo === "trimestre") return [1, 2, 3, 4].map((t) => ({ valor: t, label: `${t}º trimestre` }));
  if (tipo === "semestre") return [1, 2].map((s) => ({ valor: s, label: `${s}º semestre` }));
  return [];
}

export function DashboardComparativo({
  ano: anoIni,
  tipo: tipoIni,
  indice: indiceIni,
  base: baseIni,
  categorias,
  comparativo: compIni,
}: {
  ano: number;
  tipo: TipoPeriodo;
  indice: number;
  base: BaseRegime;
  categorias: CategoriaRef[];
  comparativo: Comparativo;
}) {
  const [ano, setAno] = useState(anoIni);
  const [tipo, setTipo] = useState<TipoPeriodo>(tipoIni);
  const [indice, setIndice] = useState(indiceIni);
  const [base, setBase] = useState<BaseRegime>(baseIni);
  const [comp, setComp] = useState<Comparativo>(compIni);
  const [carregando, setCarregando] = useState(false);
  void categorias;

  async function recarregar(next: { ano?: number; tipo?: TipoPeriodo; indice?: number; base?: BaseRegime }) {
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
    const r = await dashboardOrcadoRealizado(a, t, i, b);
    if (r) setComp(r.comparativo);
    setCarregando(false);
  }

  const rec = comp.grupos.find((g) => g.natureza === "RECEITA");
  const des = comp.grupos.find((g) => g.natureza === "DESPESA");
  const todasLinhas: LinhaComparativo[] = comp.grupos.flatMap((g) => g.linhas);
  const anos = [anoIni - 2, anoIni - 1, anoIni, anoIni + 1];
  const idxOpts = opcoesIndice(tipo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={ano}
          onChange={(e) => recarregar({ ano: Number(e.target.value) })}
          disabled={carregando}
          className={controleCls("compacto")}
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg border border-linha">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => recarregar({ tipo: t.id })}
              disabled={carregando}
              className={`px-3 py-1.5 text-sm ${tipo === t.id ? "bg-verde font-semibold text-white" : "bg-white text-cinza"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {idxOpts.length > 0 && (
          <select
            value={indice}
            onChange={(e) => recarregar({ indice: Number(e.target.value) })}
            disabled={carregando}
            className={controleCls("compacto")}
          >
            {idxOpts.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto inline-flex overflow-hidden rounded-full border border-linha">
          {(["competencia", "caixa"] as BaseRegime[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => recarregar({ base: b })}
              disabled={carregando}
              className={`px-3 py-1.5 text-xs ${base === b ? "bg-texto text-white" : "bg-white text-cinza"}`}
            >
              {b === "competencia" ? "Competência" : "Caixa"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {rec && (
          <Cartao
            titulo="Receitas"
            natureza="RECEITA"
            orcado={rec.totalOrcado}
            realizado={rec.totalRealizado}
            varAbs={rec.varAbs}
            varPct={rec.varPct}
          />
        )}
        {des && (
          <Cartao
            titulo="Despesas"
            natureza="DESPESA"
            orcado={des.totalOrcado}
            realizado={des.totalRealizado}
            varAbs={des.varAbs}
            varPct={des.varPct}
          />
        )}
        <Cartao
          titulo="Resultado"
          natureza="RECEITA"
          orcado={comp.resultado.orcado}
          realizado={comp.resultado.realizado}
          varAbs={comp.resultado.varAbs}
          varPct={comp.resultado.varPct}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-linha bg-white p-4">
          <h3 className="mb-3 font-display text-sm font-semibold text-texto">Orçado × Realizado por categoria</h3>
          <BarrasCategoria linhas={todasLinhas} />
        </div>
        <div className="rounded-2xl border border-linha bg-white p-4">
          <h3 className="mb-1 font-display text-sm font-semibold text-texto">Evolução da receita (ano)</h3>
          <p className="mb-1 text-xs text-cinza">Orçado (cinza) × realizado (verde)</p>
          <LinhaEvolucao serie={comp.serieReceita} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="px-3 py-2 text-right font-medium">Orçado</th>
              <th className="px-3 py-2 text-right font-medium">Realizado</th>
              <th className="px-3 py-2 text-right font-medium">Variação R$</th>
              <th className="px-3 py-2 text-right font-medium">Variação %</th>
            </tr>
          </thead>
          <tbody>
            {comp.grupos.map((g) => (
              <FragmentoGrupo key={g.natureza} grupo={g} />
            ))}
            <tr className="border-t-2 border-linha font-bold">
              <td className="px-3 py-2">Resultado</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(comp.resultado.orcado)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(comp.resultado.realizado)}</td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${favoravel("RECEITA", comp.resultado.varAbs) ? "text-verde" : "text-negativo"}`}
              >
                {formatarMoeda(comp.resultado.varAbs)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${favoravel("RECEITA", comp.resultado.varAbs) ? "text-verde" : "text-negativo"}`}
              >
                {pctTxt(comp.resultado.varPct)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cartao({
  titulo,
  natureza,
  orcado,
  realizado,
  varAbs,
  varPct,
}: {
  titulo: string;
  natureza: "RECEITA" | "DESPESA";
  orcado: number;
  realizado: number;
  varAbs: number;
  varPct: number | null;
}) {
  const bom = favoravel(natureza, varAbs);
  return (
    <div className="rounded-2xl border border-linha bg-white p-4">
      <div className="text-[11px] uppercase tracking-wide text-cinza">{titulo}</div>
      <div className="my-1 text-2xl font-bold tabular-nums text-texto">{formatarMoeda(realizado)}</div>
      <div className="text-xs text-cinza">orçado {formatarMoeda(orcado)}</div>
      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${bom ? "bg-verde/10 text-verde" : "bg-negativo/10 text-negativo"}`}
      >
        {varAbs >= 0 ? "▲" : "▼"} {pctTxt(varPct)} vs orçado
      </span>
    </div>
  );
}

function FragmentoGrupo({ grupo }: { grupo: Comparativo["grupos"][number] }) {
  const bomGrupo = favoravel(grupo.natureza, grupo.varAbs);
  return (
    <>
      <tr className="bg-creme">
        <td
          colSpan={5}
          className="px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wide text-texto"
        >
          {grupo.natureza === "RECEITA" ? "Receitas" : "Despesas"}
        </td>
      </tr>
      {grupo.linhas.map((l) => {
        const bom = favoravel(l.natureza, l.varAbs);
        return (
          <tr key={l.categoriaId} className="border-b border-linha/60">
            <td className="px-3 py-2 text-texto">{l.nome}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.orcado)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.realizado)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${bom ? "text-verde" : "text-negativo"}`}>
              {formatarMoeda(l.varAbs)}
            </td>
            <td className={`px-3 py-2 text-right tabular-nums ${bom ? "text-verde" : "text-negativo"}`}>
              {pctTxt(l.varPct)}
            </td>
          </tr>
        );
      })}
      <tr className="border-b border-linha font-semibold">
        <td className="px-3 py-2">Total {grupo.natureza === "RECEITA" ? "receitas" : "despesas"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(grupo.totalOrcado)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(grupo.totalRealizado)}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${bomGrupo ? "text-verde" : "text-negativo"}`}>
          {formatarMoeda(grupo.varAbs)}
        </td>
        <td className={`px-3 py-2 text-right tabular-nums ${bomGrupo ? "text-verde" : "text-negativo"}`}>
          {pctTxt(grupo.varPct)}
        </td>
      </tr>
    </>
  );
}
