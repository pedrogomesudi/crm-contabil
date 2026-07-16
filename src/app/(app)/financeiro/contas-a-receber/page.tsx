import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { ContasReceber } from "@/components/financeiro/ContasReceber";
import { lerAutomacao } from "./actions";

export default async function ContasReceberPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeVerHonorario(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data: contas } = await supabase.from("conta_bancaria").select("id, nome").eq("ativa", true).order("nome");
  const automacao = await lerAutomacao();
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <Voltar href="/financeiro/cadastros" />
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">Contas a receber</h1>
      <ContasReceber contas={contas ?? []} automacaoInicial={automacao} />
    </main>
  );
}
