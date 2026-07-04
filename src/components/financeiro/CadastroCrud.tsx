"use client";
import Link from "next/link";
import { useActionState, useState } from "react";

export type CampoDesc = {
  nome: string;
  label: string;
  tipo: "texto" | "numero" | "select" | "textarea";
  opcoes?: { valor: string; label: string }[];
  obrigatorio?: boolean;
};
export type RegistroCrud = { id: string; ativa: boolean; [k: string]: unknown };
export type EstadoCrud = { erro?: string; ok?: boolean };

export function CadastroCrud({
  titulo,
  campos,
  itens,
  salvar,
  alternarAtiva,
  voltarHref = "/financeiro/cadastros",
}: {
  titulo: string;
  campos: CampoDesc[];
  itens: RegistroCrud[];
  salvar: (prev: EstadoCrud, fd: FormData) => Promise<EstadoCrud>;
  alternarAtiva: (fd: FormData) => Promise<void>;
  voltarHref?: string;
}) {
  const [editando, setEditando] = useState<RegistroCrud | null>(null);
  const [estado, action, pending] = useActionState(salvar, {} as EstadoCrud);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          {editando ? "Editar" : "Novo"}
        </h2>
        <form action={action} className="space-y-3">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          {campos.map((c) => (
            <label key={c.nome} className="block text-sm">
              <span className="text-slate-700">{c.label}</span>
              {c.tipo === "select" ? (
                <select
                  name={c.nome}
                  required={c.obrigatorio}
                  defaultValue={String(editando?.[c.nome] ?? "")}
                  className="mt-1 w-full rounded border border-slate-300 p-2"
                >
                  <option value="">—</option>
                  {c.opcoes?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : c.tipo === "textarea" ? (
                <textarea
                  name={c.nome}
                  required={c.obrigatorio}
                  defaultValue={String(editando?.[c.nome] ?? "")}
                  className="mt-1 w-full rounded border border-slate-300 p-2"
                />
              ) : (
                <input
                  name={c.nome}
                  type={c.tipo === "numero" ? "number" : "text"}
                  step={c.tipo === "numero" ? "0.01" : undefined}
                  required={c.obrigatorio}
                  defaultValue={String(editando?.[c.nome] ?? "")}
                  className="mt-1 w-full rounded border border-slate-300 p-2"
                />
              )}
            </label>
          ))}
          {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}
          {estado.ok && <p className="text-sm text-green-700">Salvo.</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
            )}
            <Link
              href={voltarHref}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Voltar
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              {campos.map((c) => (
                <th key={c.nome} className="p-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="p-2 font-medium">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => (
              <tr
                key={it.id}
                className={`border-b border-slate-100 ${it.ativa ? "" : "opacity-50"}`}
              >
                {campos.map((c) => (
                  <td key={c.nome} className="p-2">
                    {String(it[c.nome] ?? "")}
                  </td>
                ))}
                <td className="p-2">{it.ativa ? "Ativo" : "Inativo"}</td>
                <td className="p-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditando(it)}
                    className="mr-2 text-slate-600 underline"
                  >
                    Editar
                  </button>
                  <form action={alternarAtiva} className="inline">
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="ativa" value={it.ativa ? "false" : "true"} />
                    <button type="submit" className="text-slate-600 underline">
                      {it.ativa ? "Inativar" : "Reativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={campos.length + 2} className="p-4 text-center text-slate-400">
                  Nenhum registro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
