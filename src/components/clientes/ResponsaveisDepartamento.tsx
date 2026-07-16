"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirResponsavel } from "@/app/(app)/clientes/[id]/responsaveis-actions";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";

export function ResponsaveisDepartamento({
  clienteId,
  colaboradores,
  atuais,
  editavel,
}: {
  clienteId: string;
  colaboradores: { id: string; nome: string }[];
  atuais: Record<Departamento, string | null>;
  editavel: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const nome = (id: string | null) => colaboradores.find((c) => c.id === id)?.nome ?? "—";

  async function mudar(depto: Departamento, value: string) {
    setOcupado(true);
    const r = await definirResponsavel(clienteId, depto, value || null);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-linha bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-texto">Responsáveis por departamento</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {DEPARTAMENTOS.map((d) => (
          <label key={d.valor} className="text-xs text-cinza">
            {d.rotulo}
            {editavel ? (
              <select
                disabled={ocupado}
                defaultValue={atuais[d.valor] ?? ""}
                onChange={(e) => mudar(d.valor, e.target.value)}
                className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm text-texto"
              >
                <option value="">— sem responsável</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-0.5 text-sm text-texto">{nome(atuais[d.valor])}</p>
            )}
          </label>
        ))}
      </div>
    </section>
  );
}
