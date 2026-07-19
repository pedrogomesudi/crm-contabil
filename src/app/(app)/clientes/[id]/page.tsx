import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarContadores, contadorPorId } from "@/lib/clientes/contadores";
import {
  podeAtribuirContador,
  podeVerHonorario,
  podeExcluirCliente,
  podeCriarCliente,
  podeGerenciarResponsaveis,
} from "@/lib/clientes/permissoes";
import { ResponsaveisDepartamento } from "@/components/clientes/ResponsaveisDepartamento";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";
import { LegalizacaoSection } from "@/components/legalizacao/LegalizacaoSection";
import { AtivarEmpresa } from "@/components/clientes/AtivarEmpresa";
import { TarefasCliente } from "@/components/tarefas/TarefasCliente";
import { ProcessosSop } from "@/components/tarefas/ProcessosSop";
import { listarModelosAtivos, listarProcessos } from "@/app/(app)/tarefas/sop-actions";
import { listarTarefas } from "@/app/(app)/tarefas/actions";
import { PortalCliente } from "@/components/clientes/PortalCliente";
import { listarAcessosPortal } from "./portal-actions";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";
import { progressoProcesso } from "@/lib/legalizacao/processo";
import { rotuloTipo, type LegTipo, type LegEtapaStatus } from "@/lib/legalizacao/tipos";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { HonorarioForm } from "@/components/HonorarioForm";
import { LinhaTempoVigencias } from "@/components/clientes/LinhaTempoVigencias";
import { DocumentosSection } from "@/components/documentos/DocumentosSection";
import { EmailsCliente } from "@/components/clientes/EmailsCliente";
import { LgpdCliente } from "@/components/clientes/LgpdCliente";
import { listarEmails, listarAnexaveis } from "./email-actions";
import { variaveisDoCliente } from "@/lib/email/template";
import { podeEnviarEmail } from "@/lib/clientes/permissoes";
import { NotasFiscaisSection } from "@/components/nfse/NotasFiscaisSection";
import { EmissaoClienteSection } from "@/components/nfse/EmissaoClienteSection";
import { VencimentosSection } from "@/components/vencimentos/VencimentosSection";
import { GerarContrato } from "@/components/contrato/GerarContrato";
import { AcoesExclusaoCliente } from "@/components/clientes/AcoesExclusaoCliente";
import { BotaoAtualizarReceita } from "@/components/clientes/BotaoAtualizarReceita";
import { ContratosSection } from "@/components/financeiro/ContratosSection";
import { OptOutCobranca } from "@/components/clientes/OptOutCobranca";
import { OptOutLegalizacao } from "@/components/clientes/OptOutLegalizacao";
import { VinculosSection } from "@/components/clientes/VinculosSection";
import { consolidarRelacionadas } from "@/lib/clientes/vinculos";
import { ObrigacoesCliente } from "./ObrigacoesCliente";
import { listarInstancias } from "@/app/(app)/obrigacoes/actions";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { listarContratos } from "./contratos";
import { atualizarCliente } from "../actions";
import { Container } from "@/components/ui/Container";
import { Abas } from "@/components/ui/Abas";
import { Badge } from "@/components/ui/Badge";
import { Voltar } from "@/components/ui/Voltar";

export const metadata = { title: "Cliente" };

export default async function FichaClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaPedida } = await searchParams;
  const supabase = await createServerSupabase();

  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  const papel = perfil.papel;

  const { data: cliente } = await supabase
    .from("clientes")
    .select(
      "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, telefone_ddi, endereco, responsavel_nome, representante, contador_id, status, data_inicio, observacoes, excluido_em, atualizado_em, competencia_inicial, aceita_comunicados, comunicar_legalizacao, grupo_id, matriz_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  // RF-026: vínculos (grupo econômico + matriz/filial).
  const cli = cliente as { grupo_id: string | null; matriz_id: string | null };
  const [
    { data: grupoRow },
    { data: gruposRows },
    { data: filiaisRows },
    { data: matrizRow },
    { data: gruposMatesRows },
    { data: candMatrizRows },
  ] = await Promise.all([
    cli.grupo_id
      ? supabase.from("grupo_economico").select("id, nome").eq("id", cli.grupo_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("grupo_economico").select("id, nome").order("nome"),
    supabase.from("clientes").select("id, razao_social").eq("matriz_id", id),
    cli.matriz_id
      ? supabase.from("clientes").select("id, razao_social").eq("id", cli.matriz_id).maybeSingle()
      : Promise.resolve({ data: null }),
    cli.grupo_id
      ? supabase.from("clientes").select("id, razao_social").eq("grupo_id", cli.grupo_id)
      : Promise.resolve({ data: [] as { id: string; razao_social: string }[] }),
    supabase.from("clientes").select("id, razao_social").is("matriz_id", null).neq("id", id).order("razao_social"),
  ]);
  const filiais = (filiaisRows ?? []).map((f) => ({ id: f.id as string, razao_social: f.razao_social as string }));
  const relacionadas = consolidarRelacionadas(id, [
    {
      tipo: "grupo",
      empresas: (gruposMatesRows ?? []).map((g) => ({ clienteId: g.id as string, nome: g.razao_social as string })),
    },
    { tipo: "filial", empresas: filiais.map((f) => ({ clienteId: f.id, nome: f.razao_social })) },
    ...(matrizRow
      ? [
          {
            tipo: "matriz" as const,
            empresas: [{ clienteId: matrizRow.id as string, nome: matrizRow.razao_social as string }],
          },
        ]
      : []),
  ]);

  // E-mail integrado (RF-051): histórico + o que dá para anexar + templates ativos.
  const emails = await listarEmails(id);
  const anexaveis = podeEnviarEmail(papel) ? await listarAnexaveis(id) : [];
  const { data: tplRows } = await supabase
    .from("email_template")
    .select("id, nome, assunto, corpo")
    .eq("ativo", true)
    .order("nome");
  const templatesEmail = (tplRows ?? []).map((t) => ({
    id: t.id as string,
    nome: t.nome as string,
    assunto: t.assunto as string,
    corpo: t.corpo as string,
  }));
  const { data: marcaEmail } = await supabase.from("escritorio_config").select("nome").eq("id", 1).maybeSingle();
  const variaveisEmail = variaveisDoCliente(
    {
      razaoSocial: cliente.razao_social as string,
      cnpj: (cliente.cpf_cnpj as string | null) ?? null,
      email: (cliente.email as string | null) ?? null,
    },
    (marcaEmail?.nome as string | null) ?? "",
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  );

  // Só admin reatribui contador no UPDATE (trigger congela p/ os demais).
  const contadorEditavel = podeAtribuirContador(papel, "editar");
  let contadores: { id: string; nome: string }[] = [];
  if (contadorEditavel) {
    contadores = await listarContadores();
  } else if (cliente.contador_id) {
    const c = await contadorPorId(cliente.contador_id);
    if (c) contadores = [c];
  }

  // Responsáveis por departamento (camada nova; não altera a RLS/visibilidade).
  const respEditavel = podeGerenciarResponsaveis(papel) || (papel === "contador" && cliente.contador_id === perfil.id);
  const { data: respRows } = await supabase
    .from("cliente_responsavel")
    .select("departamento, usuario_id")
    .eq("cliente_id", id);
  const atuaisResp = Object.fromEntries(DEPARTAMENTOS.map((d) => [d.valor, null])) as Record<
    Departamento,
    string | null
  >;
  for (const r of respRows ?? []) atuaisResp[r.departamento as Departamento] = (r.usuario_id as string) ?? null;
  const colaboradores = await listarColaboradores();

  // Legalização / societário — processos do cliente.
  const podeLegalizacao = podeGerenciarLegalizacao(papel);
  const { data: procs } = await supabase
    .from("legalizacao_processo")
    .select("id, tipo, titulo, status")
    .eq("cliente_id", id)
    .order("criado_em", { ascending: false });
  const procIds = (procs ?? []).map((p) => p.id as string);
  const { data: etapasProc } = procIds.length
    ? await supabase.from("legalizacao_etapa").select("processo_id, status, prazo").in("processo_id", procIds)
    : { data: [] };
  const etapasPorProc = new Map<string, { status: LegEtapaStatus; prazo: string | null }[]>();
  for (const e of etapasProc ?? []) {
    const a = etapasPorProc.get(e.processo_id as string) ?? [];
    a.push({ status: e.status as LegEtapaStatus, prazo: (e.prazo as string | null) ?? null });
    etapasPorProc.set(e.processo_id as string, a);
  }
  const processosLeg = (procs ?? []).map((p) => {
    const pr = progressoProcesso(etapasPorProc.get(p.id as string) ?? []);
    return {
      id: p.id as string,
      titulo: (p.titulo as string) || rotuloTipo(p.tipo as LegTipo),
      status: p.status as string,
      pct: pr.pct,
      proximoPrazo: pr.proximoPrazo,
    };
  });
  const { data: modelosLeg } = await supabase
    .from("legalizacao_template")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  // Tarefas do cliente.
  const tarefasCliente = await listarTarefas({ cliente: id });
  const modelosSop = await listarModelosAtivos();
  const processosSop = await listarProcessos(id);

  // Acessos ao portal (só admin/assistente gerenciam; a action já barra os demais).
  const gerenciaPortal = papel === "admin" || papel === "assistente";
  const acessosPortal = gerenciaPortal ? await listarAcessosPortal(id) : [];

  const mostrarHonorario = podeVerHonorario(papel);
  let valorHonorario: number | null = null;
  let cobrancaWhatsapp = true;
  let cobrancaEmail = true;
  let extensaoFinanceira = {
    dia_vencimento: null as number | null,
    qtd_funcionarios: null as number | null,
    faixa_faturamento: null as string | null,
    data_saida: null as string | null,
    indice_reajuste: null as string | null,
    percentual_reajuste: null as number | null,
  };
  if (mostrarHonorario) {
    const { data: fin } = await supabase
      .from("clientes_financeiro")
      .select(
        "honorario_mensal, dia_vencimento, qtd_funcionarios, faixa_faturamento, data_saida, cobranca_whatsapp, cobranca_email, indice_reajuste, percentual_reajuste",
      )
      .eq("cliente_id", id)
      .maybeSingle();
    valorHonorario = fin?.honorario_mensal != null ? Number(fin.honorario_mensal) : null;
    cobrancaWhatsapp = fin?.cobranca_whatsapp !== false;
    cobrancaEmail = fin?.cobranca_email !== false;
    if (fin) {
      extensaoFinanceira = {
        dia_vencimento: fin.dia_vencimento ?? null,
        qtd_funcionarios: fin.qtd_funcionarios ?? null,
        faixa_faturamento: fin.faixa_faturamento ?? null,
        data_saida: fin.data_saida ?? null,
        indice_reajuste: fin.indice_reajuste ?? null,
        percentual_reajuste: fin.percentual_reajuste != null ? Number(fin.percentual_reajuste) : null,
      };
    }
  }

  const contratos = mostrarHonorario ? await listarContratos(id) : [];

  const hojeObrigacoes = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anoObrigacoes = Number(hojeObrigacoes.slice(0, 4));
  const mesObrigacoes = Number(hojeObrigacoes.slice(5, 7));
  const obrigacoesDoMes = podeCriarCliente(papel)
    ? await listarInstancias(anoObrigacoes, mesObrigacoes, { clienteId: id })
    : [];

  const emConstituicao = cliente.status === "em_constituicao";
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  // As 19 seções desciam numa coluna só — scroll infinito, e com três larguras brigando
  // entre si. Agora vivem em 5 abas por afinidade, com o estado na URL (?aba=fiscal), então
  // link direto e botão voltar continuam funcionando. Nenhuma seção sumiu, e cada gate de
  // permissão é o mesmo de antes: quem não podia ver, continua não vendo.
  const ABAS = [
    { chave: "cadastro", rotulo: "Cadastro" },
    ...(mostrarHonorario ? [{ chave: "financeiro", rotulo: "Financeiro" }] : []),
    { chave: "fiscal", rotulo: "Fiscal" },
    { chave: "documentos", rotulo: "Documentos" },
    { chave: "relacao", rotulo: "Relação" },
  ];
  // O Abas já cai na primeira quando a chave não existe; aqui a mesma regra decide o que renderizar.
  const aba = abaPedida && ABAS.some((a) => a.chave === abaPedida) ? abaPedida : "cadastro";

  return (
    <Container>
      <div className="space-y-4">
        <Voltar href="/clientes" label="Clientes" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-texto">{cliente.razao_social}</h1>
            {emConstituicao && <Badge variante="atencao">Em constituição</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {podeCriarCliente(papel) && (
              <Link href={`/onboarding/${id}`} className="text-sm text-verde underline">
                Abrir onboarding
              </Link>
            )}
            {["admin", "assistente"].includes(papel) &&
              String(cliente.cpf_cnpj ?? "").replace(/\D/g, "").length === 14 && (
                <BotaoAtualizarReceita cpfCnpj={cliente.cpf_cnpj} />
              )}
          </div>
        </div>

        {(cliente as { competencia_inicial: string | null }).competencia_inicial && (
          <p className="text-sm text-cinza">
            Competência inicial: {(cliente as { competencia_inicial: string }).competencia_inicial.slice(5, 7)}/
            {(cliente as { competencia_inicial: string }).competencia_inicial.slice(0, 4)}
          </p>
        )}

        <Abas itens={ABAS} ativa={aba} base={`/clientes/${id}`} />

        {aba === "cadastro" && (
          <div className="space-y-4">
            {emConstituicao && <AtivarEmpresa clienteId={id} regimeAtual={cliente.regime_tributario as string} />}
            <FormCliente
              key={cliente.atualizado_em}
              action={atualizarCliente.bind(null, id)}
              contadores={contadores}
              cliente={cliente as ClienteDefaults}
              modo="editar"
              contadorEditavel={contadorEditavel}
            />
            {podeCriarCliente(papel) && (
              <LegalizacaoSection
                clienteId={id}
                processos={processosLeg}
                modelos={(modelosLeg ?? []).map((m) => ({ id: m.id as string, nome: m.nome as string }))}
                podeGerenciar={podeLegalizacao}
                hoje={hoje}
              />
            )}
            {podeCriarCliente(papel) && (
              <VinculosSection
                clienteId={id}
                podeEditar={podeCriarCliente(papel)}
                grupo={grupoRow ? { id: grupoRow.id as string, nome: grupoRow.nome as string } : null}
                gruposDisponiveis={(gruposRows ?? []).map((g) => ({ id: g.id as string, nome: g.nome as string }))}
                matriz={
                  matrizRow ? { id: matrizRow.id as string, razao_social: matrizRow.razao_social as string } : null
                }
                filiais={filiais}
                candidatosMatriz={(candMatrizRows ?? []).map((c) => ({
                  id: c.id as string,
                  razao_social: c.razao_social as string,
                }))}
                relacionadas={relacionadas}
              />
            )}
            {podeLegalizacao && (
              <section className="rounded-lg border border-linha bg-white p-4">
                <OptOutLegalizacao
                  clienteId={id}
                  ligado={(cliente as { comunicar_legalizacao?: boolean }).comunicar_legalizacao !== false}
                />
              </section>
            )}
            {podeExcluirCliente(papel) && (
              <AcoesExclusaoCliente
                clienteId={id}
                excluidoEm={(cliente as { excluido_em: string | null }).excluido_em}
              />
            )}
          </div>
        )}

        {aba === "financeiro" && mostrarHonorario && (
          <div className="space-y-4">
            <HonorarioForm clienteId={id} valorAtual={valorHonorario} extensao={extensaoFinanceira} />
            <LinhaTempoVigencias clienteId={id} papel={papel} />
            <ContratosSection clienteId={id} contratos={contratos} />
            <section className="rounded-lg border border-linha bg-white p-4">
              <OptOutCobranca
                clienteId={id}
                whatsapp={cobrancaWhatsapp}
                email={cobrancaEmail}
                comunicados={cliente.aceita_comunicados !== false}
              />
            </section>
          </div>
        )}

        {aba === "fiscal" && (
          <div className="space-y-4">
            {podeCriarCliente(papel) && (
              <ObrigacoesCliente
                clienteId={id}
                ano={anoObrigacoes}
                mes={mesObrigacoes}
                instancias={obrigacoesDoMes}
                podeGerar={podeGerenciarMatriz(papel)}
              />
            )}
            <NotasFiscaisSection clienteId={id} papel={papel} />
            <EmissaoClienteSection clienteId={id} papel={papel} />
            <VencimentosSection clienteId={id} papel={papel} />
          </div>
        )}

        {aba === "documentos" && (
          <div className="space-y-4">
            <DocumentosSection
              clienteId={id}
              papel={papel}
              clienteNome={cliente.responsavel_nome ?? cliente.razao_social}
              clienteEmail={cliente.email ?? ""}
            />
            {mostrarHonorario && <GerarContrato clienteId={id} hoje={hoje} />}
            {papel === "admin" && <LgpdCliente clienteId={id} />}
          </div>
        )}

        {aba === "relacao" && (
          <div className="space-y-4">
            <EmailsCliente
              clienteId={id}
              emailCliente={cliente.email ?? ""}
              variaveis={variaveisEmail}
              templates={templatesEmail}
              anexaveis={anexaveis}
              emails={emails}
              podeEnviar={podeEnviarEmail(papel)}
            />
            <TarefasCliente clienteId={id} tarefas={tarefasCliente} />
            <ProcessosSop clienteId={id} modelos={modelosSop} processos={processosSop} hoje={hoje} />
            {podeCriarCliente(papel) && (
              <ResponsaveisDepartamento
                clienteId={id}
                colaboradores={colaboradores}
                atuais={atuaisResp}
                editavel={respEditavel}
              />
            )}
            {gerenciaPortal && <PortalCliente clienteId={id} acessos={acessosPortal} />}
          </div>
        )}
      </div>
    </Container>
  );
}
