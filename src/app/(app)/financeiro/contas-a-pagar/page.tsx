import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { ContasPagar } from "@/components/financeiro/ContasPagar";

export default async function ContasPagarPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const [contas, fornecedores, categorias] = await Promise.all([
    supabase.from("conta_bancaria").select("id, nome").eq("ativa", true).order("nome"),
    supabase.from("fornecedor").select("id, nome").eq("ativa", true).order("nome"),
    supabase.from("categoria").select("id, nome").eq("natureza", "DESPESA").eq("ativa", true).order("ordem_dre"),
  ]);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-slate-900">Contas a pagar</h1>
      <ContasPagar contas={contas.data ?? []} fornecedores={fornecedores.data ?? []} categorias={categorias.data ?? []} />
    </main>
  );
}
