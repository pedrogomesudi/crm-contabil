import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarContadores, contadorPorId } from "@/lib/clientes/contadores";
import { podeAtribuirContador, podeVerHonorario, podeExcluirCliente, podeCriarCliente } from "@/lib/clientes/permissoes";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { HonorarioForm } from "@/components/HonorarioForm";
import { LinhaTempoVigencias } from "@/components/clientes/LinhaTempoVigencias";
import { DocumentosSection } from "@/components/documentos/DocumentosSection";
import { NotasFiscaisSection } from "@/components/nfse/NotasFiscaisSection";
import { EmissaoClienteSection } from "@/components/nfse/EmissaoClienteSection";
import { VencimentosSection } from "@/components/vencimentos/VencimentosSection";
import { GerarContrato } from "@/components/contrato/GerarContrato";
import { AcoesExclusaoCliente } from "@/components/clientes/AcoesExclusaoCliente";
import { BotaoAtualizarReceita } from "@/components/clientes/BotaoAtualizarReceita";
import { ContratosSection } from "@/components/financeiro/ContratosSection";
import { OptOutCobranca } from "@/components/clientes/OptOutCobranca";
import { ObrigacoesCliente } from "./ObrigacoesCliente";
import { listarInstancias } from "@/app/(app)/obrigacoes/actions";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { listarContratos } from "./contratos";
import { atualizarCliente } from "../actions";

export const metadata = { title: "Cliente" };

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  const papel = perfil.papel;

  const { data: cliente } = await supabase
    .from("clientes")
    .select(
      "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, endereco, responsavel_nome, representante, contador_id, status, data_inicio, observacoes, excluido_em, atualizado_em, competencia_inicial",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  // Só admin reatribui contador no UPDATE (trigger congela p/ os demais).
  const contadorEditavel = podeAtribuirContador(papel, "editar");
  let contadores: { id: string; nome: string }[] = [];
  if (contadorEditavel) {
    contadores = await listarContadores();
  } else if (cliente.contador_id) {
    const c = await contadorPorId(cliente.contador_id);
    if (c) contadores = [c];
  }

  const mostrarHonorario = podeVerHonorario(papel);
  let valorHonorario: number | null = null;
  let optOutCobranca = true;
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
      .select("honorario_mensal, dia_vencimento, qtd_funcionarios, faixa_faturamento, data_saida, cobranca_whatsapp, indice_reajuste, percentual_reajuste")
      .eq("cliente_id", id)
      .maybeSingle();
    valorHonorario = fin?.honorario_mensal != null ? Number(fin.honorario_mensal) : null;
    optOutCobranca = fin?.cobranca_whatsapp !== false;
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
  const obrigacoesDoMes = podeCriarCliente(papel) ? await listarInstancias(anoObrigacoes, mesObrigacoes, { clienteId: id }) : [];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">{cliente.razao_social}</h1>
      {(cliente as { competencia_inicial: string | null }).competencia_inicial && (
        <p className="-mt-4 text-sm text-cinza">
          Competência inicial: {(cliente as { competencia_inicial: string }).competencia_inicial.slice(5, 7)}/{(cliente as { competencia_inicial: string }).competencia_inicial.slice(0, 4)}
        </p>
      )}
      {podeCriarCliente(papel) && (
        <Link href={`/onboarding/${id}`} className="text-sm text-verde underline">
          Abrir onboarding
        </Link>
      )}
      {podeExcluirCliente(papel) && (
        <AcoesExclusaoCliente
          clienteId={id}
          excluidoEm={(cliente as { excluido_em: string | null }).excluido_em}
        />
      )}
      {["admin", "assistente"].includes(papel) &&
        String(cliente.cpf_cnpj ?? "").replace(/\D/g, "").length === 14 && (
          <BotaoAtualizarReceita cpfCnpj={cliente.cpf_cnpj} />
        )}
      <FormCliente
        key={cliente.atualizado_em}
        action={atualizarCliente.bind(null, id)}
        contadores={contadores}
        cliente={cliente as ClienteDefaults}
        modo="editar"
        contadorEditavel={contadorEditavel}
      />
      {mostrarHonorario && (
        <HonorarioForm clienteId={id} valorAtual={valorHonorario} extensao={extensaoFinanceira} />
      )}
      {mostrarHonorario && <LinhaTempoVigencias clienteId={id} papel={papel} />}
      {mostrarHonorario && <ContratosSection clienteId={id} contratos={contratos} />}
      {mostrarHonorario && (
        <section className="rounded-lg border border-linha bg-white p-4">
          <OptOutCobranca clienteId={id} ativo={optOutCobranca} />
        </section>
      )}
      {mostrarHonorario && (
        <GerarContrato
          clienteId={id}
          hoje={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
        />
      )}
      <DocumentosSection
        clienteId={id}
        papel={papel}
        clienteNome={cliente.responsavel_nome ?? cliente.razao_social}
        clienteEmail={cliente.email ?? ""}
      />
      <NotasFiscaisSection clienteId={id} papel={papel} />
      <EmissaoClienteSection clienteId={id} papel={papel} />
      {podeCriarCliente(papel) && (
        <ObrigacoesCliente
          clienteId={id}
          ano={anoObrigacoes}
          mes={mesObrigacoes}
          instancias={obrigacoesDoMes}
          podeGerar={podeGerenciarMatriz(papel)}
        />
      )}
      <VencimentosSection clienteId={id} papel={papel} />
    </div>
  );
}
