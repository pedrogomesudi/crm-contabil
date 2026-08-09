"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import { exportarClientesHonorario, type ClienteHonorarioRow } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ClientesHonorario({ linhas }: { linhas: ClienteHonorarioRow[] }) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const filtradas = linhas.filter((l) => !q || l.nome.toLowerCase().includes(q) || l.documento.includes(q));
  const total = filtradas.reduce((s, l) => s + l.honorario, 0);
  const inp = controleCls("compacto");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CPF/CNPJ"
          className={inp}
        />
        <span className="text-xs text-cinza">
          {filtradas.length} de {linhas.length}
        </span>
        {/* A exportação leva a carteira inteira, não o filtro da tela. */}
        <div className="ml-auto">
          <BotaoExportar acao={exportarClientesHonorario} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Cliente / Razão social</th>
              <th className="px-3 py-2 font-medium">CPF/CNPJ</th>
              <th className="px-3 py-2 text-right font-medium">Honorário mensal</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-cinza">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
            {filtradas.map((l, i) => (
              <tr key={i} className="border-b border-linha/60">
                <td className="px-3 py-1.5 text-texto">{l.nome}</td>
                <td className="px-3 py-1.5 tabular-nums">{l.documento}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{brl(l.honorario)}</td>
              </tr>
            ))}
            {filtradas.length > 0 && (
              <tr className="border-t border-linha font-medium">
                <td className="px-3 py-1.5">Total</td>
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
