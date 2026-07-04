import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { CadastroCrud, type CampoDesc } from "@/components/financeiro/CadastroCrud";
import { salvarCentro, alternarAtivaCentro } from "./actions";

const CAMPOS: CampoDesc[] = [{ nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true }];

export default async function CentrosDeCustoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("centro_custo").select("id, nome, ativa").order("nome");
  return (
    <CadastroCrud
      titulo="Centros de custo"
      campos={CAMPOS}
      itens={data ?? []}
      salvar={salvarCentro}
      alternarAtiva={alternarAtivaCentro}
    />
  );
}
