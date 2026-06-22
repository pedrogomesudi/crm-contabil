import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { CardResumo } from "@/components/CardResumo";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { REGIMES, type Papel } from "@/lib/tipos";

export const metadata = { title: "Início" };

export default async function Dashboard() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: eu } = await supabase
    .from("usuarios")
    .select("papel")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const podeCriar = podeCriarCliente(eu?.papel as Papel | undefined);

  // Contagens (RLS filtra por papel). head:true => só o count, sem trazer linhas.
  const contar = () => supabase.from("clientes").select("*", { count: "exact", head: true });

  const [totalR, ativosR, recentesR, ...regimesR] = await Promise.all([
    contar(),
    contar().eq("status", "ativo"),
    supabase
      .from("clientes")
      .select("id, razao_social, atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(5),
    ...REGIMES.map((r) => contar().eq("regime_tributario", r)),
  ]);

  const total = totalR.count ?? 0;
  const ativos = ativosR.count ?? 0;
  const inativos = Math.max(0, total - ativos);
  const recentes = recentesR.data ?? [];
  const porRegime = REGIMES.map((r, i) => ({ regime: r, qtd: regimesR[i]?.count ?? 0 }));

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
              + Novo cliente
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

      {/* Números-resumo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CardResumo titulo="Total de clientes" valor={total} />
        <CardResumo titulo="Ativos" valor={ativos} />
        <CardResumo titulo="Inativos" valor={inativos} />
      </div>

      {/* Distribuição por regime */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Por regime tributário</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {porRegime.map(({ regime, qtd }) => (
            <div key={regime} className="rounded border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{regime}</p>
              <p className="text-lg font-semibold text-slate-900">{qtd}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Atividade recente */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Atividade recente</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {recentes.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <Link href={`/clientes/${c.id}`} className="text-slate-900 underline">
                {c.razao_social}
              </Link>
              <span className="text-xs text-slate-400">
                {new Date(c.atualizado_em).toLocaleDateString("pt-BR")}
              </span>
            </li>
          ))}
          {recentes.length === 0 && (
            <li className="py-2 text-slate-400">Nenhum cliente cadastrado ainda.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
