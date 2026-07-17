"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { iniciarProcesso } from "@/app/(app)/legalizacao/actions";

type Proc = { id: string; titulo: string; status: string; pct: number; proximoPrazo: string | null };
const ROT: Record<string, string> = { em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function LegalizacaoSection({
  clienteId,
  processos,
  modelos,
  podeGerenciar,
  hoje,
}: {
  clienteId: string;
  processos: Proc[];
  modelos: { id: string; nome: string }[];
  podeGerenciar: boolean;
  hoje: string;
}) {
  const router = useRouter();
  const [modelo, setModelo] = useState(modelos[0]?.id ?? "");
  const [data, setData] = useState(hoje);
  const [ocupado, setOcupado] = useState(false);

  async function iniciar() {
    if (!modelo) return;
    setOcupado(true);
    const r = await iniciarProcesso(clienteId, modelo, data);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    if (r.id) router.push(`/legalizacao/${r.id}`);
  }

  return (
    <section className="rounded-lg border border-linha bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-texto">Legalização / Societário</h2>
      {processos.length === 0 ? (
        <p className="mt-1 text-sm text-cinza">Nenhum processo aberto.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {processos.map((p) => (
            <li key={p.id}>
              <Link
                href={`/legalizacao/${p.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-linha px-3 py-2 text-sm hover:bg-creme"
              >
                <span className="font-medium text-texto">{p.titulo}</span>
                <span className="flex items-center gap-3 text-xs text-cinza">
                  <span>{ROT[p.status] ?? p.status}</span>
                  <span className="tabular-nums">{p.pct}%</span>
                  <span>prazo {dataBR(p.proximoPrazo)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {podeGerenciar && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-linha pt-3">
          <label className="text-xs text-cinza">
            Modelo
            <select
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className={`${controleCls("compacto")} mt-0.5 block`}
            >
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-cinza">
            Início
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={`${controleCls("compacto")} mt-0.5 block`}
            />
          </label>
          <button
            disabled={ocupado || !modelo}
            onClick={iniciar}
            className="rounded-lg bg-verde px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            {ocupado ? "Iniciando…" : "Iniciar processo"}
          </button>
        </div>
      )}
    </section>
  );
}
