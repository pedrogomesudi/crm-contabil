import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { statusConfig } from "./actions";
import { FormEmail } from "./FormEmail";
import { Voltar } from "@/components/ui/Voltar";

export const metadata = { title: "E-mail" };

export default async function EmailConfigPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const status = await statusConfig();
  if (!status) redirect("/");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="E-mail" subtitulo="Canal de envio, remetente e teste de entrega" />
      {!status.provedor && (
        <p className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">
          Configure o canal para enviar e-mails aos clientes pela ficha.
        </p>
      )}
      <FormEmail status={status} emailAdmin={user?.email ?? ""} />
      <p className="text-xs text-cinza">
        Os templates com variáveis ficam em{" "}
        <Link href="/configuracoes/email/templates" className="text-verde underline">
          Templates de e-mail
        </Link>
        .
      </p>
    </Container>
  );
}
