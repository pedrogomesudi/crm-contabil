"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState, useTransition } from "react";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import { formatarData } from "@/lib/format";
import { listarContasVencimento, exportarContasVencimento, type ContaRow, type TipoConta } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ContasVencimento({
  inicio: iniIni,
  fim: fimIni,
  linhasIni,
}: {
  inicio: string;
  fim: string;
  linhasIni: ContaRow[];
}) {
  const [tipo, setTipo] = useState<TipoConta>("RECEBER");
  const [inicio, setInicio] = useState(iniIni);
  const [fim, setFim] = useState(fimIni);
  const [linhas, setLinhas] = useState<ContaRow[]>(linhasIni);
  const [carregando, startTransition] = useTransition();

  function recarregar(next: { tipo?: TipoConta; inicio?: string; fim?: string }) {
    const t = next.tipo ?? tipo;
    const i = next.inicio ?? inicio;
    const f = next.fim ?? fim;
    setTipo(t);
    setInicio(i);
    setFim(f);
    startTransition(async () => setLinhas(await listarContasVencimento(t, i, f)));
  }

  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const rotuloNome = tipo === "RECEBER" ? "Cliente" : "Credor";
  const inp = controleCls("compacto");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-linha p-0.5 text-sm">
          <button
            type="button"
            onClick={() => recarregar({ tipo: "RECEBER" })}
            className={`rounded px-2 py-0.5 ${tipo === "RECEBER" ? "bg-verde text-white" : "text-cinza"}`}
          >
            A receber
          </button>
          <button
            type="button"
            onClick={() => recarregar({ tipo: "PAGAR" })}
            className={`rounded px-2 py-0.5 ${tipo === "PAGAR" ? "bg-verde text-white" : "text-cinza"}`}
          >
            A pagar
          </button>
        </div>
        <input type="date" value={inicio} onChange={(e) => recarregar({ inicio: e.target.value })} className={inp} />
        <input type="date" value={fim} onChange={(e) => recarregar({ fim: e.target.value })} className={inp} />
        <div className="ml-auto">
          <BotaoExportar acao={(formato) => exportarContasVencimento(tipo, inicio, fim, formato)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">{rotuloNome}</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Vencimento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-cinza">
                  {carregando ? "Carregando…" : "Nenhuma conta em aberto no período."}
                </td>
              </tr>
            )}
            {linhas.map((r, i) => (
              <tr key={i} className="border-b border-linha/60">
                <td className="px-3 py-1.5 text-texto">{r.nome}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{brl(r.valor)}</td>
                <td className="px-3 py-1.5">{formatarData(r.vencimento)}</td>
              </tr>
            ))}
            {linhas.length > 0 && (
              <tr className="border-t border-linha font-medium">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{brl(total)}</td>
                <td className="px-3 py-1.5" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
