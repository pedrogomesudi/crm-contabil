import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { CadastroCrud, type CampoDesc } from "@/components/financeiro/CadastroCrud";
import { CONTA_TIPOS } from "@/lib/financeiro/tipos";
import { salvarConta, alternarAtivaConta } from "./actions";

const CAMPOS: CampoDesc[] = [
  { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true },
  {
    nome: "tipo",
    label: "Tipo",
    tipo: "select",
    obrigatorio: true,
    opcoes: CONTA_TIPOS.map((t) => ({ valor: t, label: t })),
  },
  { nome: "banco", label: "Banco", tipo: "texto" },
  { nome: "agencia", label: "Agência", tipo: "texto" },
  { nome: "numero", label: "Número", tipo: "texto" },
  { nome: "saldo_inicial", label: "Saldo inicial", tipo: "numero" },
];

export default async function ContasPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("conta_bancaria")
    .select("id, nome, tipo, banco, agencia, numero, saldo_inicial, ativa")
    .order("nome");
  return (
    <CadastroCrud
      titulo="Contas bancárias"
      campos={CAMPOS}
      itens={data ?? []}
      salvar={salvarConta}
      alternarAtiva={alternarAtivaConta}
    />
  );
}
