"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState, useTransition } from "react";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import { formatarData } from "@/lib/format";
import { listarHonorariosAbertos, exportarHonorariosAbertos, type HonorarioAbertoRow } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function HonorariosAbertos({
  inicio: iniIni,
  fim: fimIni,
  linhasIni,
}: {
  inicio: string;
  fim: string;
  linhasIni: HonorarioAbertoRow[];
}) {
  const [inicio, setInicio] = useState(iniIni);
  const [fim, setFim] = useState(fimIni);
  const [linhas, setLinhas] = useState<HonorarioAbertoRow[]>(linhasIni);
  const [busca, setBusca] = useState("");
  const [carregando, startTransition] = useTransition();

  function recarregar(next: { inicio?: string; fim?: string }) {
    const i = next.inicio ?? inicio;
    const f = next.fim ?? fim;
    setInicio(i);
    setFim(f);
    startTransition(async () => setLinhas(await listarHonorariosAbertos(i, f)));
  }

  const q = busca.trim().toLowerCase();
  const filtradas = linhas.filter((l) => !q || l.nome.toLowerCase().includes(q));
  const total = filtradas.reduce((s, l) => s + l.valor, 0);
  const inp = controleCls("compacto");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={inicio} onChange={(e) => recarregar({ inicio: e.target.value })} className={inp} />
        <input type="date" value={fim} onChange={(e) => recarregar({ fim: e.target.value })} className={inp} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente"
          className={inp}
        />
        <span className="text-xs text-cinza">
          {filtradas.length} de {linhas.length}
        </span>
        {/* A exportação leva o período inteiro, não o filtro de busca da tela. */}
        <div className="ml-auto">
          <BotaoExportar acao={(formato) => exportarHonorariosAbertos(inicio, fim, formato)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Competência</th>
              <th className="px-3 py-2 font-medium">Vencimento</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 text-right font-medium">Valor em aberto</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-cinza">
                  {carregando ? "Carregando…" : "Nenhum honorário em aberto no período."}
                </td>
              </tr>
            )}
            {filtradas.map((r, i) => (
              <tr key={i} className="border-b border-linha/60">
                <td className="px-3 py-1.5 text-texto">{r.nome}</td>
                <td className="px-3 py-1.5 tabular-nums">{r.competencia}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatarData(r.vencimento)}</td>
                <td className={`px-3 py-1.5 ${r.situacao.startsWith("Vencido") ? "text-negativo" : "text-cinza"}`}>
                  {r.situacao}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{brl(r.valor)}</td>
              </tr>
            ))}
            {filtradas.length > 0 && (
              <tr className="border-t border-linha font-medium">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right tabular-nums">{brl(total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
