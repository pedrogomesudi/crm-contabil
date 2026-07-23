import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { urlLogoAtual } from "./actions";
import { FormMarca } from "./FormMarca";
import { FormProposta } from "./FormProposta";
import { FormSla } from "./FormSla";

export const metadata = { title: "Marca do escritório" };

export default async function MarcaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const supabase = await createServerSupabase();
  const { data: marca } = await supabase
    .from("escritorio_config")
    .select(
      "nome, cnpj, email, telefone, endereco, proposta_modelo, proposta_template_tipo, proposta_template_path, solicitacao_sla_dias",
    )
    .eq("id", 1)
    .maybeSingle();
  const logoUrl = await urlLogoAtual();

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Marca do escritório" subtitulo="Identidade usada na proposta comercial e no whitelabel" />
      {!marca?.nome && (
        <p className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">
          Configure a marca para usá-la na proposta comercial.
        </p>
      )}
      <FormMarca marca={marca ?? null} logoUrl={logoUrl} />
      <FormProposta
        modelo={(marca?.proposta_modelo as "padrao" | "proprio" | null) ?? "padrao"}
        templateTipo={(marca?.proposta_template_tipo as "docx" | "html" | null) ?? null}
        temTemplate={Boolean(marca?.proposta_template_path)}
      />
      <FormSla dias={(marca?.solicitacao_sla_dias as number | null) ?? 2} />
    </Container>
  );
}
