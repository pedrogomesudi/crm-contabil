import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const supabase = await createServerSupabase();

  let query = supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, tipo_pessoa, regime_tributario, status")
    .order("atualizado_em", { ascending: false })
    .limit(100);

  if (q) {
    const digits = q.replace(/\D/g, "");
    if (digits && digits.length === q.length) {
      query = query.ilike("cpf_cnpj", `%${digits}%`);
    } else {
      query = query.ilike("razao_social", `%${q}%`);
    }
  }
  if (status === "ativo" || status === "inativo") {
    query = query.eq("status", status);
  }

  const { data: clientes } = await query;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
        <Link href="/clientes/novo" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          + Novo cliente
        </Link>
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nome ou CPF/CNPJ"
          aria-label="Buscar"
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="Filtrar por status"
          className="rounded border border-slate-300 px-2 text-sm text-slate-900"
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
        <button className="rounded border border-slate-300 px-3 text-sm text-slate-700">
          Filtrar
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-700">
            <tr>
              <th className="p-2 font-medium">Nome</th>
              <th className="p-2 font-medium">CPF/CNPJ</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium">Regime</th>
              <th className="p-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {clientes?.map((cl) => (
              <tr key={cl.id} className="border-t border-slate-100">
                <td className="p-2">
                  <Link href={`/clientes/${cl.id}`} className="text-slate-900 underline">
                    {cl.razao_social}
                  </Link>
                </td>
                <td className="p-2 text-slate-700">{cl.cpf_cnpj}</td>
                <td className="p-2 text-slate-700">{cl.tipo_pessoa}</td>
                <td className="p-2 text-slate-700">{cl.regime_tributario}</td>
                <td className="p-2">
                  <span className={cl.status === "ativo" ? "text-green-700" : "text-slate-400"}>
                    {cl.status}
                  </span>
                </td>
              </tr>
            ))}
            {!clientes?.length && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
