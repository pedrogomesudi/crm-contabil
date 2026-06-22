import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarContadores, contadorPorId } from "@/lib/clientes/contadores";
import { podeAtribuirContador, podeVerHonorario } from "@/lib/clientes/permissoes";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { HonorarioForm } from "@/components/HonorarioForm";
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
      "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, endereco, responsavel_nome, contador_id, status, data_inicio, observacoes, atualizado_em",
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
  if (mostrarHonorario) {
    const { data: fin } = await supabase
      .from("clientes_financeiro")
      .select("honorario_mensal")
      .eq("cliente_id", id)
      .maybeSingle();
    valorHonorario = fin?.honorario_mensal != null ? Number(fin.honorario_mensal) : null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{cliente.razao_social}</h1>
      <FormCliente
        action={atualizarCliente.bind(null, id)}
        contadores={contadores}
        cliente={cliente as ClienteDefaults}
        modo="editar"
        contadorEditavel={contadorEditavel}
      />
      {mostrarHonorario && <HonorarioForm clienteId={id} valorAtual={valorHonorario} />}
    </div>
  );
}
