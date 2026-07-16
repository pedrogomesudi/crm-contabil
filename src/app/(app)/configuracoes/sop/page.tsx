import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarRecorrencias } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarTemplatesSop } from "./actions";
import { FormSop } from "./FormSop";

export const metadata = { title: "Modelos de processo (SOPs)" };

export default async function SopPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarRecorrencias(perfil.papel)) redirect("/");
  const templates = await listarTemplatesSop();

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <Link href="/configuracoes" className="text-sm text-verde underline">
        ← Configurações
      </Link>
      <PageHeader
        titulo="Modelos de processo (SOPs)"
        subtitulo="Etapas que viram tarefas — em ondas paralelas e sequenciais"
      />
      <FormSop templates={templates} />
    </main>
  );
}
