"use client";
import { controleCls } from "@/components/ui/Campo";
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
  const [estado, action, pend] = useActionState<EstadoContrato, FormData>(salvarContrato.bind(null, clienteId), {});
  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Contratos</h2>
      <ul className="divide-y divide-linha text-sm">
        {contratos.map((ct) => (
          <li key={ct.id} className="flex items-center justify-between py-2">
            <span>
              {ct.descricao} · {formatarMoeda(Number(ct.valor_mensal))} · venc. dia {ct.dia_vencimento}
              {ct.status !== "ATIVO" && <span className="ml-1 text-xs text-cinza-claro">({ct.status})</span>}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setEditando(ct)} className="text-cinza underline">
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
                  className="text-negativo underline"
                >
                  Encerrar
                </button>
              )}
            </span>
          </li>
        ))}
        {contratos.length === 0 && <li className="py-2 text-cinza-claro">Nenhum contrato.</li>}
      </ul>

      <form action={action} className="space-y-2 border-t border-linha/70 pt-3">
        <p className="text-xs font-medium text-cinza">{editando ? "Editar contrato" : "Novo contrato"}</p>
        {editando && <input type="hidden" name="id" value={editando.id} />}
        <div className="grid grid-cols-2 gap-2">
          <input
            name="descricao"
            placeholder="Descrição"
            required
            defaultValue={editando?.descricao ?? ""}
            className={controleCls("compacto")}
          />
          <input
            name="valor_mensal"
            type="number"
            step="0.01"
            placeholder="Valor mensal"
            required
            defaultValue={editando?.valor_mensal ?? ""}
            className={controleCls("compacto")}
          />
          <input
            name="dia_vencimento"
            type="number"
            min={1}
            max={28}
            placeholder="Dia venc. (1–28)"
            required
            defaultValue={editando?.dia_vencimento ?? ""}
            className={controleCls("compacto")}
          />
          <input
            name="data_inicio"
            type="date"
            required
            defaultValue={editando?.data_inicio ?? ""}
            className={controleCls("compacto")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="gera_decimo_terceiro" defaultChecked={editando?.gera_decimo_terceiro ?? false} />
          Gera 13º
          <input
            name="mes_decimo_terceiro"
            type="number"
            min={1}
            max={12}
            defaultValue={editando?.mes_decimo_terceiro ?? 12}
            className={`${controleCls("compacto")} w-16`}
            title="Mês do 13º"
          />
        </label>
        {estado.erro && <p className="text-sm text-negativo">{estado.erro}</p>}
        {estado.ok && <p className="text-sm text-verde">Contrato salvo.</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pend}
            className="rounded-lg bg-verde px-3 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
          >
            {pend ? "Salvando…" : "Salvar contrato"}
          </button>
          {editando && (
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="rounded border border-linha px-3 py-2 text-sm"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
