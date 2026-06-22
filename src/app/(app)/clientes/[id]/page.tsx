import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarContadores, contadorPorId } from "@/lib/clientes/contadores";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { HonorarioForm } from "@/components/HonorarioForm";
import { atualizarCliente } from "../actions";

export const metadata = { title: "Cliente" };

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: eu } = await supabase
    .from("usuarios")
    .select("papel")
    .eq("id", user.id)
    .maybeSingle();
  const papel = eu?.papel;

  const { data: cliente } = await supabase
    .from("clientes")
    .select(
      "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, endereco, responsavel_nome, contador_id, status, data_inicio, observacoes, atualizado_em",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  // Só admin reatribui contador no UPDATE (trigger congela p/ os demais).
  const contadorEditavel = papel === "admin";
  let contadores: { id: string; nome: string }[] = [];
  if (contadorEditavel) {
    contadores = await listarContadores();
  } else if (cliente.contador_id) {
    const c = await contadorPorId(cliente.contador_id);
    if (c) contadores = [c];
  }

  const podeVerHonorario = papel === "admin" || papel === "financeiro" || papel === "contador";
  let valorHonorario: number | null = null;
  if (podeVerHonorario) {
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
      {podeVerHonorario && <HonorarioForm clienteId={id} valorAtual={valorHonorario} />}
    </div>
  );
}
