import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormBoletos } from "./FormBoletos";
import { obterConfigBoleto } from "./actions";

export default async function BoletosConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const config = await obterConfigBoleto();
  const supabase = await createServerSupabase();
  const { data: contas } = await supabase.from("conta_bancaria").select("id, nome").eq("ativa", true).order("nome");
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <PageHeader titulo="Boletos" subtitulo="Provedor de emissão (Inter ou Asaas)" />
      <FormBoletos config={config} contas={(contas as { id: string; nome: string }[] | null) ?? []} />
    </Container>
  );
}
