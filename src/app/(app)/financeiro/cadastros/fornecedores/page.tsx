import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { CadastroCrud, type CampoDesc, type RegistroCrud } from "@/components/financeiro/CadastroCrud";
import { salvarFornecedor, alternarAtivaFornecedor } from "./actions";

const CAMPOS: CampoDesc[] = [
  { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true },
  { nome: "cnpj_cpf", label: "CNPJ/CPF", tipo: "texto" },
  { nome: "telefone", label: "Telefone", tipo: "texto" },
  { nome: "email", label: "E-mail", tipo: "texto" },
];

export default async function FornecedoresPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("fornecedor").select("id, nome, cnpj_cpf, contato, ativa").order("nome");
  // Achatar contato jsonb -> colunas telefone/email para a tabela e o form de edição.
  const itens: RegistroCrud[] = (data ?? []).map((f) => ({
    id: f.id,
    ativa: f.ativa,
    nome: f.nome,
    cnpj_cpf: f.cnpj_cpf ?? "",
    telefone: (f.contato as { telefone?: string } | null)?.telefone ?? "",
    email: (f.contato as { email?: string } | null)?.email ?? "",
  }));
  return (
    <CadastroCrud
      titulo="Fornecedores"
      campos={CAMPOS}
      itens={itens}
      salvar={salvarFornecedor}
      alternarAtiva={alternarAtivaFornecedor}
    />
  );
}
