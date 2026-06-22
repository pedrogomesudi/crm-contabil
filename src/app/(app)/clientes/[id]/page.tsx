import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { HonorarioForm } from "@/components/HonorarioForm";
import { atualizarCliente } from "../actions";

export const metadata = { title: "Cliente" };

async function listarContadores() {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id, nome")
    .eq("papel", "contador")
    .eq("ativo", true)
    .order("nome");
  return data ?? [];
}

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: eu } = await supabase.from("usuarios").select("papel").eq("id", user.id).single();

  const { data: cliente } = await supabase
    .from("clientes")
    .select(
      "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, endereco, responsavel_nome, contador_id, status, data_inicio, observacoes",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const contadores = await listarContadores();

  const podeVerHonorario =
    eu?.papel === "admin" || eu?.papel === "financeiro" || eu?.papel === "contador";
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
      />
      {podeVerHonorario && <HonorarioForm clienteId={id} valorAtual={valorHonorario} />}
    </div>
  );
}
