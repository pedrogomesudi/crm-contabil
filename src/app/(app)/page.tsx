import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { CardResumo } from "@/components/CardResumo";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { formatarData } from "@/lib/format";
import { REGIMES } from "@/lib/tipos";

export const metadata = { title: "Início" };

type Resumo = {
  total: number;
  ativos: number;
  inativos: number;
  por_regime: Record<string, number>;
};

const nf = new Intl.NumberFormat("pt-BR");

export default async function Dashboard() {
  const perfil = await getPerfilAtual();
  const podeCriar = podeCriarCliente(perfil?.papel);
  const ehContador = perfil?.papel === "contador";

  const supabase = await createServerSupabase();
  // Uma RPC agregada (snapshot consistente, respeita RLS) + os recentes.
  const [resumoR, recentesR] = await Promise.all([
    supabase.rpc("dashboard_resumo"),
    supabase
      .from("clientes")
      .select("id, razao_social, atualizado_em")
      .order("atualizado_em", { ascending: false })
      .order("id")
      .limit(5),
  ]);

  // Erros tratados de forma independente: uma query que falha não esconde a outra.
  const erroResumo = !!resumoR.error;
  const erroRecentes = !!recentesR.error;
  const resumo = (resumoR.data ?? null) as Resumo | null;
  const total = resumo?.total ?? 0;
  const ativos = resumo?.ativos ?? 0;
  const inativos = resumo?.inativos ?? 0;
  const porRegime = resumo?.por_regime ?? {};
  const recentes = recentesR.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Início</h1>
        <div className="flex gap-2">
          {podeCriar && (
            <Link
              href="/clientes/novo"
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <span aria-hidden="true">+ </span>Novo cliente
            </Link>
          )}
          <Link
            href="/clientes"
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Ver todos
          </Link>
        </div>
      </div>

      {erroResumo ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar o resumo. Tente novamente.
        </p>
      ) : total === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600">
            {ehContador
              ? "Você ainda não tem clientes atribuídos."
              : "Nenhum cliente cadastrado ainda."}
          </p>
          {podeCriar && (
            <Link
              href="/clientes/novo"
              className="mt-3 inline-block rounded bg-slate-900 px-4 py-2 text-sm text-white"
            >
              {ehContador ? "Cadastrar um cliente" : "Cadastrar o primeiro cliente"}
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Números-resumo */}
          <section
            aria-label="Resumo de clientes"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            <CardResumo titulo="Total de clientes" valor={nf.format(total)} />
            <CardResumo titulo="Ativos" valor={nf.format(ativos)} />
            <CardResumo titulo="Inativos" valor={nf.format(inativos)} />
          </section>

          {/* Distribuição por regime */}
          <section
            aria-labelledby="h-regime"
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <h2 id="h-regime" className="mb-3 text-sm font-semibold text-slate-900">
              Por regime tributário
            </h2>
            <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {REGIMES.map((regime) => (
                <div key={regime} className="rounded border border-slate-100 bg-slate-50 p-3">
                  <dt className="text-xs text-slate-600">{regime}</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {nf.format(porRegime[regime] ?? 0)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Clientes atualizados recentemente */}
          <section
            aria-labelledby="h-recentes"
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <h2 id="h-recentes" className="mb-3 text-sm font-semibold text-slate-900">
              Clientes atualizados recentemente
            </h2>
            {erroRecentes ? (
              <p role="alert" className="text-sm text-red-700">
                Não foi possível carregar os clientes recentes.
              </p>
            ) : recentes.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum cliente recente.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {recentes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <Link href={`/clientes/${c.id}`} className="text-slate-900 underline">
                      {c.razao_social}
                    </Link>
                    <time
                      dateTime={c.atualizado_em ?? undefined}
                      className="text-xs text-slate-600"
                    >
                      {formatarData(c.atualizado_em)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
