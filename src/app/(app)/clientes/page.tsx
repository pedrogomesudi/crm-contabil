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
import { Botao } from "@/components/ui/Botao";
import { Painel } from "@/components/ui/Painel";
import { TabelaCartao } from "@/components/ui/TabelaCartao";
import { Badge } from "@/components/ui/Badge";
import { Iniciais } from "@/components/ui/Iniciais";
import { EmptyState } from "@/components/ui/EmptyState";
import { badgeRegime } from "@/lib/ui/apresentacao";
import { Container } from "@/components/ui/Container";
import { Paginacao } from "@/components/ui/Paginacao";
import { totalPaginas, paginaValida, intervaloPagina } from "@/lib/ui/paginacao";
import { estadoContratoCliente, LABEL_CONTRATO, type EstadoContrato } from "@/lib/clientes/contrato-status";

export const metadata = { title: "Clientes" };

const POR_PAGINA = 100;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ok?: string; pagina?: string }>;
}) {
  const { q: qRaw, status, ok, pagina: paginaRaw } = await searchParams;
  const q = (qRaw ?? "").slice(0, 100);
  const supabase = await createServerSupabase();
  const perfil = await getPerfilAtual();
  const podeCriar = podeCriarCliente(perfil?.papel);

  const filtro = normalizarFiltro(status);
  // Duas passadas: a 1ª conta (head, sem trafegar linha) para saber quantas páginas existem e
  // poder validar a página pedida; a 2ª traz só a fatia. Sem a contagem, a tela não teria como
  // dizer "de 7" nem barrar uma página fora do intervalo.
  let contagem = supabase.from("clientes").select("id", { count: "exact", head: true });
  contagem = aplicarFiltroStatus(aplicarBusca(contagem, q), filtro);
  const { count } = await contagem;
  const total = count ?? 0;
  const paginas = totalPaginas(total, POR_PAGINA);
  const pagina = paginaValida(paginaRaw, paginas);
  const { de, ate } = intervaloPagina(pagina, POR_PAGINA);

  let query = supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, tipo_pessoa, regime_tributario, status, excluido_em")
    .order("atualizado_em", { ascending: false })
    .range(de, ate);

  query = aplicarFiltroStatus(aplicarBusca(query, q), filtro);

  const { data: clientes, error } = await query;

  // Situação do contrato de honorários dos clientes DESTA página — duas consultas para a página
  // inteira, não uma por linha. O embed nomeia a FK: `assinaturas` tem duas chaves para
  // `documentos` (documento_id e documento_assinado_id) e o PostgREST recusa o embed ambíguo.
  const ids = (clientes ?? []).map((c) => c.id as string);
  const contratos = new Map<string, EstadoContrato>();
  if (ids.length > 0) {
    const [{ data: assins }, { data: docs }] = await Promise.all([
      supabase
        .from("assinaturas")
        .select("cliente_id, status, documentos!assinaturas_documento_id_fkey(tipo)")
        .in("cliente_id", ids),
      supabase.from("documentos").select("cliente_id, tipo").in("cliente_id", ids).ilike("tipo", "contrato assinado"),
    ]);
    const porCliente = new Map<string, { status: string }[]>();
    for (const a of assins ?? []) {
      const doc = Array.isArray(a.documentos) ? a.documentos[0] : a.documentos;
      const tipo = (doc as { tipo?: string } | null)?.tipo ?? "";
      // Só envelopes de CONTRATO: o mesmo fluxo envia procuração e outros documentos.
      if (!/contrato/i.test(tipo)) continue;
      const lista = porCliente.get(a.cliente_id as string) ?? [];
      lista.push({ status: a.status as string });
      porCliente.set(a.cliente_id as string, lista);
    }
    const assinadoEmPapel = new Set((docs ?? []).map((d) => d.cliente_id as string));
    for (const id of ids) {
      contratos.set(id, estadoContratoCliente(porCliente.get(id) ?? [], assinadoEmPapel.has(id)));
    }
  }

  // Obrigações e Vencimentos voltaram para o menu (agora são itens próprios, com badge cada
  // um) — nada em "Clientes" sugeria conformidade fiscal. Aqui ficam só as telas que são
  // mesmo desta seção.
  const secoes: ItemSubNav[] = [
    { href: "/clientes", label: "Lista" },
    ...(podeGerenciarResponsaveis(perfil?.papel) ? [{ href: "/clientes/responsaveis", label: "Responsáveis" }] : []),
    ...(podeVerHonorario(perfil?.papel) ? [{ href: "/nfse/lote", label: "NFS-e em lote" }] : []),
  ];

  return (
    // Régua larga: é tabela — espremer as colunas em 1280px pioraria a leitura.
    <Container largura="larga">
      <div className="space-y-5">
        <PageHeader
          titulo="Clientes"
          subtitulo={error ? undefined : `${total} na carteira`}
          acoes={
            <>
              {/* A tela lista até LIMITE; a exportação refaz a busca sem limite. */}
              <BotaoExportar acao={exportarClientes.bind(null, { q, status })} />
              {/* "NFS-e em lote" e "Responsáveis" viraram chips do SubNav: são navegação, não
                  ação. Manter os dois seria a sexta forma de chegar no mesmo lugar. */}
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
            <TabelaCartao>
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
                    <th className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                      Contrato
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
                      <td className="px-4 py-3" data-rotulo="Cliente">
                        <Link href={`/clientes/${cl.id}`} className="flex items-center gap-3">
                          <Iniciais nome={cl.razao_social} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-texto">{cl.razao_social}</span>
                            <span className="block font-mono text-xs text-cinza-claro">
                              {cl.cpf_cnpj ?? "— sem CNPJ"}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3" data-rotulo="Regime">
                        {cl.regime_tributario ? (
                          <Badge variante={badgeRegime(cl.regime_tributario)}>{cl.regime_tributario}</Badge>
                        ) : (
                          <span className="text-cinza-claro">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3" data-rotulo="Contrato">
                        <BadgeContrato estado={contratos.get(cl.id as string) ?? "nenhum"} />
                      </td>
                      <td className="px-4 py-3 text-right" data-rotulo="Situação">
                        <span className="inline-flex items-center gap-1.5 text-sm text-cinza">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${cl.status === "ativo" ? "bg-verde" : cl.status === "em_constituicao" ? "bg-atencao-solido" : "bg-cinza-claro"}`}
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
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!clientes?.length && (
                    <tr>
                      <td colSpan={5}>
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
            </TabelaCartao>
            <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} base="/clientes" params={{ q, status }} />
          </Painel>
        )}
      </div>
    </Container>
  );
}

// Selo da coluna "Contrato". Cores com significado: verde = resolvido, atenção = em curso,
// vermelho = recusado, cinza = não começou.
function BadgeContrato({ estado }: { estado: EstadoContrato }) {
  if (estado === "nenhum") return <span className="text-cinza-claro">{LABEL_CONTRATO.nenhum}</span>;
  const variante = estado === "assinado" ? "positivo" : estado === "enviado" ? "atencao" : "negativo";
  return <Badge variante={variante}>{LABEL_CONTRATO[estado]}</Badge>;
}
