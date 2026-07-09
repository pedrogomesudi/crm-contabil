import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorMatriz } from "./EditorMatriz";
import { ConfigEscalonamento } from "./ConfigEscalonamento";
import { listarMatriz, obterConfigEscalonamento } from "./actions";

export default async function MatrizPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarMatriz(perfil.papel)) redirect("/");
  const [linhas, config] = await Promise.all([listarMatriz(), obterConfigEscalonamento()]);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Matriz de obrigações" subtitulo="Obrigações e critérios de incidência usados na geração do calendário" />
      <ConfigEscalonamento inicial={config} />
      <EditorMatriz linhas={linhas} />
    </main>
  );
}
