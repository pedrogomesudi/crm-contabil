import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { urlLogoAtual } from "./actions";
import { FormMarca } from "./FormMarca";

export const metadata = { title: "Marca do escritório" };

export default async function MarcaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const supabase = await createServerSupabase();
  const { data: marca } = await supabase
    .from("escritorio_config")
    .select("nome, cnpj, email, telefone, endereco")
    .eq("id", 1)
    .maybeSingle();
  const logoUrl = await urlLogoAtual();

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Marca do escritório" subtitulo="Identidade usada na proposta comercial e no whitelabel" />
      {!marca?.nome && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Configure a marca para usá-la na proposta comercial.
        </p>
      )}
      <FormMarca marca={marca ?? null} logoUrl={logoUrl} />
    </main>
  );
}
