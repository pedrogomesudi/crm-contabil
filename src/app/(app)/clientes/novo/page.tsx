import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarContadores } from "@/lib/clientes/contadores";
import { podeCriarCliente, podeAtribuirContador } from "@/lib/clientes/permissoes";
import { FormCliente, type ClienteDefaults } from "@/components/FormCliente";
import { criarCliente } from "../actions";

export const metadata = { title: "Novo cliente" };

export default async function NovoClientePage({ searchParams }: { searchParams: Promise<{ oportunidade?: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  const papel = perfil.papel;
  if (!podeCriarCliente(papel)) redirect("/clientes"); // financeiro não cria

  // admin/assistente escolhem o contador; contador é forçado a si mesmo (trigger).
  const contadorEditavel = podeAtribuirContador(papel, "novo");
  const contadores = contadorEditavel ? await listarContadores() : [];

  const oportunidadeId = (await searchParams).oportunidade ?? null;
  let defaults: ClienteDefaults | undefined;
  if (oportunidadeId) {
    const supabase = await createServerSupabase();
    const { data: op } = await supabase
      .from("oportunidade")
      .select("prospect_nome, contato_nome, contato_telefone, contato_email, origem")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (op) {
      defaults = {
        razao_social: (op.prospect_nome as string) ?? "",
        responsavel_nome: (op.contato_nome as string | null) ?? "",
        email: (op.contato_email as string | null) ?? "",
        telefone: (op.contato_telefone as string | null) ?? "",
        observacoes: op.origem ? `Origem comercial: ${op.origem as string}` : "",
      };
    }
  }

  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-texto">Novo cliente</h1>
      <FormCliente
        action={criarCliente.bind(null, oportunidadeId)}
        contadores={contadores}
        cliente={defaults}
        modo="novo"
        contadorEditavel={contadorEditavel}
      />
    </div>
  );
}
