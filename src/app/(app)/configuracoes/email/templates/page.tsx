import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarTemplatesEmail } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarTemplates } from "./actions";
import { FormTemplate } from "./FormTemplate";

export const metadata = { title: "Templates de e-mail" };

export default async function TemplatesEmailPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTemplatesEmail(perfil.papel)) redirect("/");
  const templates = await listarTemplates();

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Link href="/configuracoes/email" className="text-sm text-verde underline">
        ← E-mail
      </Link>
      <PageHeader titulo="Templates de e-mail" subtitulo="Modelos com variáveis de personalização" />
      <FormTemplate templates={templates} />
    </Container>
  );
}
