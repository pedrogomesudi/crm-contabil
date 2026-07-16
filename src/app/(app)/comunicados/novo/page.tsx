import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarContadores } from "@/lib/clientes/contadores";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTemplatesEmail } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormComunicado } from "./FormComunicado";

export const metadata = { title: "Novo comunicado" };

export default async function NovoComunicadoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTemplatesEmail(perfil.papel)) redirect("/");
  const contadores = await listarContadores();
  const colaboradores = await listarColaboradores();

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <Link href="/comunicados" className="text-sm text-verde underline">
        ← Comunicados
      </Link>
      <PageHeader titulo="Novo comunicado" subtitulo="Escreva, segmente, confira a prévia e dispare" />
      <FormComunicado contadores={contadores} colaboradores={colaboradores} />
    </main>
  );
}
