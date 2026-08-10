"use client";
import { controleCls } from "@/components/ui/Campo";
import { useMemo, useState, useTransition } from "react";
import { carregarConferencia, type ItemConferencia } from "./actions";
import { resumirConferencia, type NivelConferencia } from "@/lib/financeiro/conferencia";

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const BADGE: Record<NivelConferencia, { txt: string; cls: string }> = {
  pronto: { txt: "Pronto", cls: "bg-verde/10 text-verde" },
  falta: { txt: "Falta peça", cls: "bg-atencao-fundo text-atencao" },
  bloqueado: { txt: "Bloqueado", cls: "bg-negativo/10 text-negativo" },
  sem_honorario: { txt: "Sem honorário", cls: "bg-cinza/10 text-cinza" },
};

type Filtro = "todos" | "pendencias" | "sem_boleto" | "nota_diverge" | "sem_nota";

// Célula de uma peça: valor + marca de conferência.
function Peca({ valor, ok, ausente }: { valor: number | null; ok?: boolean; ausente?: boolean }) {
  const marca = ausente ? (
    <span className="text-cinza-claro">–</span>
  ) : ok ? (
    <span className="text-verde">✓</span>
  ) : (
    <span className="text-negativo">✕</span>
  );
  return (
    <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
      {brl(valor)} {marca}
    </span>
  );
}

export function Conferencia({ competenciaIni, itensIni }: { competenciaIni: string; itensIni: ItemConferencia[] }) {
  const [mes, setMes] = useState(competenciaIni.slice(0, 7));
  const [itens, setItens] = useState<ItemConferencia[]>(itensIni);
  const [filtro, setFiltro] = useState<Filtro>("pendencias");
  const [busca, setBusca] = useState("");
  const [carregando, start] = useTransition();

  function recarregar(nextMes: string) {
    setMes(nextMes);
    if (!/^\d{4}-\d{2}$/.test(nextMes)) return;
    start(async () => setItens(await carregarConferencia(`${nextMes}-01`)));
  }

  const resumo = useMemo(() => resumirConferencia(itens.map((i) => ({ ...i, linha: i }))), [itens]);

  const q = busca.trim().toLowerCase();
  const visiveis = itens.filter((i) => {
    if (q && !i.cliente.toLowerCase().includes(q)) return false;
    if (filtro === "todos") return true;
    if (filtro === "pendencias") return i.nivel !== "pronto";
    if (filtro === "sem_boleto") return i.pendencias.includes("Sem boleto");
    if (filtro === "nota_diverge") return i.pendencias.includes("Nota não confere com o boleto");
    if (filtro === "sem_nota") return i.pendencias.includes("Sem nota");
    return true;
  });

  const cards: { k: string; v: number; tone: string }[] = [
    { k: "Prontos", v: resumo.pronto, tone: "text-verde" },
    { k: "Sem boleto", v: resumo.semBoleto, tone: "text-negativo" },
    { k: "Nota diverge", v: resumo.notaDiverge, tone: "text-negativo" },
    { k: "Sem nota", v: resumo.semNota, tone: "text-atencao" },
  ];
  const chips: { id: Filtro; rotulo: string }[] = [
    { id: "todos", rotulo: `Todos (${resumo.total})` },
    { id: "pendencias", rotulo: `Só pendências (${resumo.total - resumo.pronto})` },
    { id: "sem_boleto", rotulo: "Sem boleto" },
    { id: "nota_diverge", rotulo: "Nota diverge" },
    { id: "sem_nota", rotulo: "Sem nota" },
  ];
  const inp = controleCls("compacto");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-cinza">
          Competência
          <input type="month" value={mes} onChange={(e) => recarregar(e.target.value)} className={`${inp} ml-2`} />
        </label>
        <span className="text-xs text-cinza">
          {resumo.total} cliente(s){carregando ? " · carregando…" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-linha bg-white p-3">
          <div className="text-xs text-cinza">Com honorário</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{resumo.total}</div>
        </div>
        {cards.map((c) => (
          <div key={c.k} className="rounded-2xl border border-linha bg-white p-3">
            <div className="text-xs text-cinza">{c.k}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${c.tone}`}>{c.v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFiltro(c.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filtro === c.id ? "border-texto bg-texto text-white" : "border-linha bg-white text-cinza"
            }`}
          >
            {c.rotulo}
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente…"
          className={`${inp} ml-auto`}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 text-right font-medium">Honorário</th>
              <th className="px-3 py-2 text-right font-medium">Título</th>
              <th className="px-3 py-2 text-right font-medium">Nota fiscal</th>
              <th className="px-3 py-2 text-right font-medium">Boleto</th>
              <th className="px-3 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-cinza">
                  Nenhum cliente neste filtro.
                </td>
              </tr>
            )}
            {visiveis.map((i) => (
              <tr key={i.clienteId} className="border-b border-linha/60 align-top">
                <td className="px-3 py-2 font-medium text-texto">{i.cliente}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(i.honorario)}</td>
                <td className="px-3 py-2 text-right">
                  <Peca
                    valor={i.titulo}
                    ausente={i.titulo == null}
                    ok={i.honorario != null && i.titulo === i.honorario}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Peca valor={i.notaValor} ausente={!i.temNota} ok={i.notaCasa} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Peca
                    valor={i.boleto}
                    ausente={i.boleto == null}
                    ok={i.boleto != null && i.titulo != null && i.boleto === i.titulo}
                  />
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[i.nivel].cls}`}>
                    {BADGE[i.nivel].txt}
                  </span>
                  {i.pendencias.length > 0 && (
                    <span className="mt-0.5 block text-[11px] text-cinza">{i.pendencias.join(" · ")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
