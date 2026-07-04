import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { CadastroCrud, type CampoDesc } from "@/components/financeiro/CadastroCrud";
import { CATEGORIA_NATUREZAS, CATEGORIA_GRUPOS } from "@/lib/financeiro/tipos";
import { salvarCategoria, alternarAtivaCategoria } from "./actions";

export default async function PlanoDeContasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("categoria")
    .select("id, nome, natureza, grupo, categoria_pai_id, ordem_dre, ativa")
    .order("ordem_dre");

  // Só categorias de 1º nível podem ser pai (limite de 2 níveis).
  const paisPossiveis = (data ?? []).filter((c) => !c.categoria_pai_id);
  const campos: CampoDesc[] = [
    { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true },
    {
      nome: "natureza",
      label: "Natureza",
      tipo: "select",
      obrigatorio: true,
      opcoes: CATEGORIA_NATUREZAS.map((n) => ({ valor: n, label: n })),
    },
    {
      nome: "grupo",
      label: "Grupo",
      tipo: "select",
      opcoes: CATEGORIA_GRUPOS.map((g) => ({ valor: g, label: g })),
    },
    {
      nome: "categoria_pai_id",
      label: "Categoria pai",
      tipo: "select",
      opcoes: paisPossiveis.map((p) => ({ valor: p.id, label: p.nome })),
    },
    { nome: "ordem_dre", label: "Ordem DRE", tipo: "numero" },
  ];

  return (
    <CadastroCrud
      titulo="Plano de contas"
      campos={campos}
      itens={data ?? []}
      salvar={salvarCategoria}
      alternarAtiva={alternarAtivaCategoria}
    />
  );
}
