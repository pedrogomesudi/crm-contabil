import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { formatarData } from "@/lib/format";
import { REGIMES } from "@/lib/tipos";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { contadoresFila } from "@/app/(app)/solicitacoes/internas/actions";
import { Botao } from "@/components/ui/Botao";

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

  // Uma fila que ninguém abre é onde os pedidos vão morrer: o número no Início é o que faz entrar.
  const fila = await contadoresFila();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Início"
        subtitulo={`${nf.format(ativos)} clientes ativos · ${nf.format(total)} no total`}
        acoes={
          <>
            {podeCriar && (
              <Link href="/clientes/novo">
                <Botao variante="primario">
                  <span aria-hidden="true">+ </span>Novo cliente
                </Botao>
              </Link>
            )}
            <Link href="/clientes">
              <Botao variante="secundario">Ver todos</Botao>
            </Link>
          </>
        }
      />

      {(fila.minhaFila > 0 || fila.vencidas > 0) && (
        <Link
          href={fila.vencidas > 0 ? "/solicitacoes/internas?vencidas=1" : "/solicitacoes/internas?minhas=1"}
          className="block rounded-2xl border border-linha bg-white p-3 text-sm hover:bg-creme"
        >
          <span className="text-texto">
            <strong>{fila.minhaFila}</strong> solicitação(ões) interna(s) na sua fila
            {fila.vencidas > 0 && (
              <span className="text-negativo"> · {fila.vencidas} com SLA vencido</span>
            )}
          </span>
        </Link>
      )}

      {erroResumo ? (
        <p role="alert" className="rounded bg-negativo/10 px-3 py-2 text-sm text-negativo">
          Não foi possível carregar o resumo. Tente novamente.
        </p>
      ) : total === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-cinza">
            {ehContador
              ? "Você ainda não tem clientes atribuídos."
              : "Nenhum cliente cadastrado ainda."}
          </p>
          {podeCriar && (
            <Link href="/clientes/novo" className="mt-3 inline-block">
              <Botao variante="primario">
                {ehContador ? "Cadastrar um cliente" : "Cadastrar o primeiro cliente"}
              </Botao>
            </Link>
          )}
        </Card>
      ) : (
        <>
          {/* Números-resumo */}
          <section aria-label="Resumo de clientes" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard rotulo="Total de clientes" valor={nf.format(total)} />
            <StatCard rotulo="Ativos" valor={nf.format(ativos)} variante="positivo" />
            <StatCard rotulo="Inativos" valor={nf.format(inativos)} />
          </section>

          {/* Distribuição por regime */}
          <Card>
            <h2 id="h-regime" className="mb-3 font-display text-sm font-semibold text-texto">
              Por regime tributário
            </h2>
            <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {REGIMES.map((regime) => (
                <div key={regime} className="rounded-lg border border-linha bg-creme p-3">
                  <dt className="text-xs text-cinza">{regime}</dt>
                  <dd className="font-display text-lg font-semibold text-texto">
                    {nf.format(porRegime[regime] ?? 0)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Clientes atualizados recentemente */}
          <Card>
            <h2 id="h-recentes" className="mb-3 font-display text-sm font-semibold text-texto">
              Clientes atualizados recentemente
            </h2>
            {erroRecentes ? (
              <p role="alert" className="text-sm text-negativo">
                Não foi possível carregar os clientes recentes.
              </p>
            ) : recentes.length === 0 ? (
              <p className="text-sm text-cinza">Nenhum cliente recente.</p>
            ) : (
              <ul className="divide-y divide-linha text-sm">
                {recentes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <Link href={`/clientes/${c.id}`} className="text-texto underline">
                      {c.razao_social}
                    </Link>
                    <time dateTime={c.atualizado_em ?? undefined} className="font-mono text-xs text-cinza-claro">
                      {formatarData(c.atualizado_em)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
