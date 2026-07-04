import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarContadores, contadorPorId } from "@/lib/clientes/contadores";
import { podeAtribuirContador, podeVerHonorario, podeExcluirCliente } from "@/lib/clientes/permissoes";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { HonorarioForm } from "@/components/HonorarioForm";
import { DocumentosSection } from "@/components/documentos/DocumentosSection";
import { NotasFiscaisSection } from "@/components/nfse/NotasFiscaisSection";
import { EmissaoClienteSection } from "@/components/nfse/EmissaoClienteSection";
import { GerarContrato } from "@/components/contrato/GerarContrato";
import { AcoesExclusaoCliente } from "@/components/clientes/AcoesExclusaoCliente";
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
      "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, endereco, responsavel_nome, representante, contador_id, status, data_inicio, observacoes, excluido_em, atualizado_em",
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
  let extensaoFinanceira = {
    dia_vencimento: null as number | null,
    qtd_funcionarios: null as number | null,
    faixa_faturamento: null as string | null,
    data_saida: null as string | null,
  };
  if (mostrarHonorario) {
    const { data: fin } = await supabase
      .from("clientes_financeiro")
      .select("honorario_mensal, dia_vencimento, qtd_funcionarios, faixa_faturamento, data_saida")
      .eq("cliente_id", id)
      .maybeSingle();
    valorHonorario = fin?.honorario_mensal != null ? Number(fin.honorario_mensal) : null;
    if (fin) {
      extensaoFinanceira = {
        dia_vencimento: fin.dia_vencimento ?? null,
        qtd_funcionarios: fin.qtd_funcionarios ?? null,
        faixa_faturamento: fin.faixa_faturamento ?? null,
        data_saida: fin.data_saida ?? null,
      };
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{cliente.razao_social}</h1>
      {podeExcluirCliente(papel) && (
        <AcoesExclusaoCliente
          clienteId={id}
          excluidoEm={(cliente as { excluido_em: string | null }).excluido_em}
        />
      )}
      <FormCliente
        action={atualizarCliente.bind(null, id)}
        contadores={contadores}
        cliente={cliente as ClienteDefaults}
        modo="editar"
        contadorEditavel={contadorEditavel}
      />
      {mostrarHonorario && (
        <HonorarioForm clienteId={id} valorAtual={valorHonorario} extensao={extensaoFinanceira} />
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
    </div>
  );
}
