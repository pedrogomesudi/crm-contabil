import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente, podeVerHonorario, podeGerenciarResponsaveis } from "@/lib/clientes/permissoes";
import { normalizarFiltro, aplicarFiltroStatus } from "@/lib/clientes/filtroStatus";
import { aplicarBusca } from "@/lib/clientes/busca";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import { exportarClientes } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubNav, type ItemSubNav } from "@/components/ui/SubNav";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { contarRiscos } from "@/app/(app)/obrigacoes/actions";
import { contarEscalonamento } from "@/app/(app)/obrigacoes/escalonamento-actions";
import { contarVencimentos } from "@/app/(app)/vencimentos/actions";
import { Botao } from "@/components/ui/Botao";
import { Painel } from "@/components/ui/Painel";
import { Badge } from "@/components/ui/Badge";
import { Iniciais } from "@/components/ui/Iniciais";
import { EmptyState } from "@/components/ui/EmptyState";
import { badgeRegime } from "@/lib/ui/apresentacao";

export const metadata = { title: "Clientes" };

const LIMITE = 100;

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
    .select("id, razao_social, cpf_cnpj, tipo_pessoa, regime_tributario, status, excluido_em")
    .order("atualizado_em", { ascending: false })
    .limit(LIMITE);

  query = aplicarBusca(query, q);
  const filtro = normalizarFiltro(status);
  query = aplicarFiltroStatus(query, filtro);

  const { data: clientes, error } = await query;

  // Obrigações, Escalonamento e Vencimentos saíram do menu lateral e vivem aqui.
  // Os badges vêm junto: um alerta que ninguém vê é um alerta que não existe.
  const secoes: ItemSubNav[] = [];
  if (podeCriarCliente(perfil?.papel)) {
    const [riscos, escal] = await Promise.all([contarRiscos(), contarEscalonamento()]);
    secoes.push({ href: "/obrigacoes", label: "Obrigações", badge: riscos || undefined });
    secoes.push({
      href: "/obrigacoes/escalonamento",
      label: "Escalonamento",
      badge: escal || undefined,
    });
  }
  if (podeGerenciarVencimentos(perfil?.papel)) {
    const venc = await contarVencimentos();
    secoes.push({ href: "/vencimentos", label: "Vencimentos", badge: venc || undefined });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Clientes"
        subtitulo={clientes ? `${clientes.length}${clientes.length === LIMITE ? "+" : ""} na carteira` : undefined}
        acoes={
          <>
            {/* A tela lista até LIMITE; a exportação refaz a busca sem limite. */}
            <BotaoExportar acao={exportarClientes.bind(null, { q, status })} />
            {podeVerHonorario(perfil?.papel) && (
              <Link href="/nfse/lote">
                <Botao variante="secundario">Emitir NFS-e em lote</Botao>
              </Link>
            )}
            {podeGerenciarResponsaveis(perfil?.papel) && (
              <Link href="/clientes/responsaveis">
                <Botao variante="secundario">Responsáveis por departamento</Botao>
              </Link>
            )}
            {podeCriar && (
              <Link href="/clientes/nova-empresa">
                <Botao variante="secundario">Nova empresa (em constituição)</Botao>
              </Link>
            )}
            {podeCriar && (
              <Link href="/clientes/novo">
                <Botao variante="primario">
                  <span aria-hidden="true">+ </span>Novo cliente
                </Botao>
              </Link>
            )}
          </>
        }
      />

      <SubNav itens={secoes} />

      {ok && (
        <p role="status" className="rounded-lg bg-verde/10 px-3 py-2 text-sm text-verde">
          Cliente salvo com sucesso.
        </p>
      )}

      <form className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza-claro"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou CPF/CNPJ"
            aria-label="Buscar"
            maxLength={100}
            className="w-full rounded-xl border border-linha bg-white py-2.5 pl-9 pr-3 text-sm text-texto placeholder:text-cinza-claro focus:border-verde"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="Filtrar por status"
          className="rounded-xl border border-linha bg-white px-3 py-2.5 text-sm text-texto focus:border-verde"
        >
          <option value="">Ativos e inativos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="excluido">Excluídos</option>
        </select>
        <Botao variante="secundario" className="py-2.5">
          Filtrar
        </Botao>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg bg-negativo/10 px-3 py-2 text-sm text-negativo">
          Não foi possível carregar os clientes. Tente novamente.
        </p>
      ) : (
        <Painel>
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de clientes</caption>
            <thead>
              <tr className="border-b border-linha bg-creme/60 text-left">
                <th className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                  Cliente
                </th>
                <th className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                  Regime
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                  Situação
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {clientes?.map((cl) => (
                <tr key={cl.id} className="border-b border-linha/70 transition last:border-0 hover:bg-creme">
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${cl.id}`} className="flex items-center gap-3">
                      <Iniciais nome={cl.razao_social} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-texto">{cl.razao_social}</span>
                        <span className="block font-mono text-xs text-cinza-claro">{cl.cpf_cnpj ?? "— sem CNPJ"}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {cl.regime_tributario ? (
                      <Badge variante={badgeRegime(cl.regime_tributario)}>{cl.regime_tributario}</Badge>
                    ) : (
                      <span className="text-cinza-claro">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5 text-sm text-cinza">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${cl.status === "ativo" ? "bg-verde" : cl.status === "em_constituicao" ? "bg-amber-500" : "bg-cinza-claro"}`}
                      />
                      {cl.status === "ativo"
                        ? "Ativo"
                        : cl.status === "em_constituicao"
                          ? "Em constituição"
                          : "Inativo"}
                    </span>
                    {cl.excluido_em && (
                      <span className="ml-2 rounded-full bg-negativo/10 px-2 py-0.5 text-xs text-negativo">
                        excluído
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Link
                      href={`/clientes/${cl.id}`}
                      aria-label={`Abrir ${cl.razao_social}`}
                      className="text-cinza-claro"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
              {!clientes?.length && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      titulo="Nenhum cliente encontrado"
                      descricao="Ajuste a busca ou cadastre um novo cliente."
                      acao={
                        podeCriar ? (
                          <Link href="/clientes/novo">
                            <Botao variante="primario">
                              <span aria-hidden="true">+ </span>Novo cliente
                            </Botao>
                          </Link>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {clientes?.length === LIMITE && (
            <p className="border-t border-linha bg-creme/60 px-4 py-2.5 text-xs text-cinza-claro">
              Mostrando os primeiros {LIMITE}. Refine a busca para ver mais.
            </p>
          )}
        </Painel>
      )}
    </div>
  );
}
