import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorMatriz } from "./EditorMatriz";
import { ConfigEscalonamento } from "./ConfigEscalonamento";
import { ToggleNotificacoes } from "./ToggleNotificacoes";
import { listarMatriz, obterConfigEscalonamento, obterNotificacaoRiscos } from "./actions";

export default async function MatrizPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarMatriz(perfil.papel)) redirect("/");
  const [linhas, config, notificacaoRiscos] = await Promise.all([listarMatriz(), obterConfigEscalonamento(), obterNotificacaoRiscos()]);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Matriz de obrigações" subtitulo="Obrigações e critérios de incidência usados na geração do calendário" />
      <ToggleNotificacoes ativoInicial={notificacaoRiscos} />
      <ConfigEscalonamento inicial={config} />
      <EditorMatriz linhas={linhas} />
    </main>
  );
}
