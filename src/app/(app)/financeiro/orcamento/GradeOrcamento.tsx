"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { listarOrcamento, salvarOrcamento, type CategoriaOrc } from "./actions";
import { achatarValores, somaLinha, somaColuna, type MapaValores } from "@/lib/financeiro/orcamento";
import { formatarMoeda } from "@/lib/format";
import { Botao } from "@/components/ui/Botao";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Célula de planilha, não campo de formulário — por isso NÃO usa o controleCls.
// São 12 colunas de mês numa linha só, dentro de <td> com 2px de padding. O degrau
// compacto (px-2 py-1.5 text-sm) alargaria a grade inteira, numa tela que existe
// justamente para caber o ano na horizontal. É exceção declarada, com motivo:
// está na lista do divida-ui.test.ts.
const celulaCls = "w-20 rounded border border-linha px-1.5 py-1 text-right text-xs tabular-nums focus:border-verde";

export function GradeOrcamento({
  ano: anoInicial,
  categorias,
  valores: valoresIniciais,
}: {
  ano: number;
  categorias: CategoriaOrc[];
  valores: MapaValores;
}) {
  const [ano, setAno] = useState(anoInicial);
  const [valores, setValores] = useState<MapaValores>(valoresIniciais);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  const receitas = categorias.filter((c) => c.natureza === "RECEITA");
  const despesas = categorias.filter((c) => c.natureza === "DESPESA");
  const anos = [anoInicial - 2, anoInicial - 1, anoInicial, anoInicial + 1];

  function setCel(cid: string, mes: number, raw: string) {
    setValores((v) => {
      const meses = { ...(v[cid] ?? {}) };
      if (raw === "") delete meses[mes];
      else meses[mes] = Number(raw);
      return { ...v, [cid]: meses };
    });
  }
  function replicar(cid: string) {
    setValores((v) => {
      const base = v[cid]?.[1] ?? 0;
      const meses: Record<number, number> = {};
      for (let m = 1; m <= 12; m++) meses[m] = base;
      return { ...v, [cid]: meses };
    });
  }
  async function trocarAno(novo: number) {
    setOcupado(true);
    setMsg(null);
    const r = await listarOrcamento(novo);
    setAno(novo);
    setValores(r.valores);
    setOcupado(false);
  }
  async function copiarAnterior() {
    setOcupado(true);
    setMsg(null);
    const r = await listarOrcamento(ano - 1);
    setValores(r.valores);
    setOcupado(false);
    setMsg({ ok: true, txt: `Valores de ${ano - 1} carregados (não salvos).` });
  }
  async function salvar() {
    setOcupado(true);
    setMsg(null);
    const r = await salvarOrcamento(ano, achatarValores(valores));
    setOcupado(false);
    setMsg(r.erro ? { ok: false, txt: r.erro } : { ok: true, txt: "Salvo ✓" });
  }

  const grupo = (titulo: string, cats: CategoriaOrc[]) => (
    <>
      <tr>
        <td colSpan={14} className="bg-creme px-2 py-1 font-display text-xs font-semibold text-texto">
          {titulo}
        </td>
      </tr>
      {cats.map((cat) => (
        <tr key={cat.id} className="border-b border-linha/60">
          <td className="sticky left-0 z-10 bg-white px-2 py-1">
            <div className="flex items-center gap-1">
              <span className="truncate">{cat.nome}</span>
              <button
                type="button"
                onClick={() => replicar(cat.id)}
                title="Replicar Jan nos 12 meses"
                className="text-cinza-claro hover:text-verde"
              >
                ⇉
              </button>
            </div>
          </td>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
            <td key={mes} className="px-0.5 py-0.5">
              <input
                type="number"
                step="0.01"
                min="0"
                value={valores[cat.id]?.[mes] ?? ""}
                onChange={(e) => setCel(cat.id, mes, e.target.value)}
                className={celulaCls}
              />
            </td>
          ))}
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums text-texto">
            {formatarMoeda(somaLinha(valores, cat.id))}
          </td>
        </tr>
      ))}
      <tr className="border-b-2 border-linha bg-white font-medium">
        <td className="sticky left-0 bg-white px-2 py-1 text-xs">Total {titulo.toLowerCase()}</td>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
          <td key={mes} className="px-1 py-1 text-right font-mono text-[11px] tabular-nums">
            {formatarMoeda(
              somaColuna(
                valores,
                cats.map((c) => c.id),
                mes,
              ),
            )}
          </td>
        ))}
        <td className="px-2 py-1 text-right font-mono text-xs">
          {formatarMoeda(cats.reduce((s, c) => s + somaLinha(valores, c.id), 0))}
        </td>
      </tr>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-cinza">
          Ano
          <select
            value={ano}
            onChange={(e) => trocarAno(Number(e.target.value))}
            disabled={ocupado}
            className={`${controleCls("compacto")} ml-2`}
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <Botao variante="secundario" onClick={copiarAnterior} disabled={ocupado}>
          Copiar do ano anterior
        </Botao>
        <Botao variante="primario" onClick={salvar} disabled={ocupado}>
          Salvar
        </Botao>
        {msg && <span className={msg.ok ? "text-sm text-verde" : "text-sm text-negativo"}>{msg.txt}</span>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left">Categoria</th>
              {MESES.map((m) => (
                <th key={m} className="px-1 py-2 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {grupo("RECEITAS", receitas)}
            {grupo("DESPESAS", despesas)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
