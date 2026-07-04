import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { CadastroCrud, type CampoDesc } from "@/components/financeiro/CadastroCrud";
import { salvarServico, alternarAtivaServico } from "./actions";

export default async function ServicosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  // Só categorias de receita servem para serviços eventuais.
  const { data: categorias } = await supabase
    .from("categoria")
    .select("id, nome")
    .eq("natureza", "RECEITA")
    .eq("ativa", true)
    .order("ordem_dre");
  const { data } = await supabase
    .from("servico")
    .select("id, nome, descricao, preco_sugerido, categoria_id, ativa")
    .order("nome");
  const campos: CampoDesc[] = [
    { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true },
    { nome: "descricao", label: "Descrição", tipo: "textarea" },
    { nome: "preco_sugerido", label: "Preço sugerido", tipo: "numero" },
    {
      nome: "categoria_id",
      label: "Categoria (receita)",
      tipo: "select",
      opcoes: (categorias ?? []).map((c) => ({ valor: c.id, label: c.nome })),
    },
  ];
  return (
    <CadastroCrud
      titulo="Serviços"
      campos={campos}
      itens={data ?? []}
      salvar={salvarServico}
      alternarAtiva={alternarAtivaServico}
    />
  );
}
