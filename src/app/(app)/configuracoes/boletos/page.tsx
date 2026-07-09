import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormBoletos } from "./FormBoletos";
import { obterConfigBoleto } from "./actions";

export default async function BoletosConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const config = await obterConfigBoleto();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <PageHeader titulo="Boletos" subtitulo="Provedor de emissão (Inter ou Asaas)" />
      <FormBoletos config={config} />
    </main>
  );
}
