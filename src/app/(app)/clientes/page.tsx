import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente, podeVerHonorario } from "@/lib/clientes/permissoes";

export const metadata = { title: "Clientes" };

const LIMITE = 100;

// Escapa os curingas de LIKE para que % e _ digitados sejam literais.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ok?: string }>;
}) {
  const { q: qRaw, status, ok } = await searchParams;
  const q = (qRaw ?? "").slice(0, 100);
  const supabase = await createServerSupabase();
  const perfil = await getPerfilAtual();
  const podeCriar = podeCriarCliente(perfil?.papel);

  let query = supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, tipo_pessoa, regime_tributario, status")
    .order("atualizado_em", { ascending: false })
    .limit(LIMITE);

  if (q) {
    const digits = q.replace(/\D/g, "");
    // só dígitos e pontuação de documento (./-) => busca por CPF/CNPJ
    const pareceDocumento = /^[\d.\-/\s]+$/.test(q) && digits.length >= 3;
    if (pareceDocumento) {
      query = query.ilike("cpf_cnpj", `%${escapeLike(digits)}%`);
    } else {
      query = query.ilike("razao_social", `%${escapeLike(q)}%`);
    }
  }
  if (status === "ativo" || status === "inativo") {
    query = query.eq("status", status);
  }

  const { data: clientes, error } = await query;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
        <div className="flex gap-2">
          {podeVerHonorario(perfil?.papel) && (
            <Link
              href="/nfse/lote"
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              Emitir NFS-e em lote
            </Link>
          )}
          {podeCriar && (
            <Link href="/clientes/novo" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
              + Novo cliente
            </Link>
          )}
        </div>
      </div>

      {ok && (
        <p role="status" className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          Cliente salvo com sucesso.
        </p>
      )}

      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou CPF/CNPJ"
          aria-label="Buscar"
          maxLength={100}
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

      {error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar os clientes. Tente novamente.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">Lista de clientes</caption>
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
                      <span className={cl.status === "ativo" ? "text-green-700" : "text-slate-600"}>
                        {cl.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!clientes?.length && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {clientes?.length === LIMITE && (
            <p className="mt-2 text-xs text-slate-500">
              Mostrando os primeiros {LIMITE}. Refine a busca para ver mais.
            </p>
          )}
        </>
      )}
    </div>
  );
}
