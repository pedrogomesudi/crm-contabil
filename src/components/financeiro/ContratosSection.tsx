"use client";
import { useActionState, useState } from "react";
import {
  salvarContrato,
  encerrarContrato,
  type Contrato,
  type EstadoContrato,
} from "@/app/(app)/clientes/[id]/contratos";
import { formatarMoeda } from "@/lib/format";

export function ContratosSection({ clienteId, contratos }: { clienteId: string; contratos: Contrato[] }) {
  const [editando, setEditando] = useState<Contrato | null>(null);
  const [estado, action, pend] = useActionState<EstadoContrato, FormData>(
    salvarContrato.bind(null, clienteId),
    {},
  );
  return (
    <section className="max-w-2xl space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Contratos</h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {contratos.map((ct) => (
          <li key={ct.id} className="flex items-center justify-between py-2">
            <span>
              {ct.descricao} · {formatarMoeda(Number(ct.valor_mensal))} · venc. dia {ct.dia_vencimento}
              {ct.status !== "ATIVO" && <span className="ml-1 text-xs text-slate-500">({ct.status})</span>}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setEditando(ct)} className="text-slate-600 underline">
                Editar
              </button>
              {ct.status === "ATIVO" && (
                <button
                  type="button"
                  onClick={async () => {
                    const motivo = prompt("Motivo do encerramento?") ?? "";
                    await encerrarContrato(ct.id, clienteId, new Date().toISOString().slice(0, 10), motivo);
                    location.reload();
                  }}
                  className="text-red-600 underline"
                >
                  Encerrar
                </button>
              )}
            </span>
          </li>
        ))}
        {contratos.length === 0 && <li className="py-2 text-slate-400">Nenhum contrato.</li>}
      </ul>

      <form action={action} className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium text-slate-700">{editando ? "Editar contrato" : "Novo contrato"}</p>
        {editando && <input type="hidden" name="id" value={editando.id} />}
        <div className="grid grid-cols-2 gap-2">
          <input name="descricao" placeholder="Descrição" required defaultValue={editando?.descricao ?? ""} className="rounded border border-slate-300 p-2 text-sm" />
          <input name="valor_mensal" type="number" step="0.01" placeholder="Valor mensal" required defaultValue={editando?.valor_mensal ?? ""} className="rounded border border-slate-300 p-2 text-sm" />
          <input name="dia_vencimento" type="number" min={1} max={28} placeholder="Dia venc. (1–28)" required defaultValue={editando?.dia_vencimento ?? ""} className="rounded border border-slate-300 p-2 text-sm" />
          <input name="data_inicio" type="date" required defaultValue={editando?.data_inicio ?? ""} className="rounded border border-slate-300 p-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="gera_decimo_terceiro" defaultChecked={editando?.gera_decimo_terceiro ?? false} />
          Gera 13º
          <input name="mes_decimo_terceiro" type="number" min={1} max={12} defaultValue={editando?.mes_decimo_terceiro ?? 12} className="w-16 rounded border border-slate-300 p-1" title="Mês do 13º" />
        </label>
        {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
        {estado.ok && <p className="text-sm text-green-700">Contrato salvo.</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pend} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60">
            {pend ? "Salvando…" : "Salvar contrato"}
          </button>
          {editando && (
            <button type="button" onClick={() => setEditando(null)} className="rounded border border-slate-300 px-3 py-2 text-sm">
              Cancelar
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
