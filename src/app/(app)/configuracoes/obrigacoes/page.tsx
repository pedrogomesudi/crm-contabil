import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorMatriz } from "./EditorMatriz";
import { listarMatriz } from "./actions";

export default async function MatrizPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarMatriz(perfil.papel)) redirect("/");
  const linhas = await listarMatriz();
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Matriz de obrigações" subtitulo="Obrigações e critérios de incidência usados na geração do calendário" />
      <EditorMatriz linhas={linhas} />
    </main>
  );
}
