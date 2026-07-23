import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { EditorMatriz } from "./EditorMatriz";
import { ConfigEscalonamento } from "./ConfigEscalonamento";
import { ToggleNotificacoes } from "./ToggleNotificacoes";
import { PainelDivergencias } from "@/components/obrigacoes/CuradoriaMatriz";
import { listarMatriz, obterConfigEscalonamento, obterNotificacaoRiscos, divergenciasDoPadrao } from "./actions";

export default async function MatrizPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarMatriz(perfil.papel)) redirect("/");
  const [linhas, config, notificacaoRiscos, diff] = await Promise.all([
    listarMatriz(),
    obterConfigEscalonamento(),
    obterNotificacaoRiscos(),
    divergenciasDoPadrao(),
  ]);
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader
        titulo="Matriz de obrigações"
        subtitulo="Obrigações e critérios de incidência usados na geração do calendário"
      />
      {/* Antes da matriz: a correção que o padrão trouxe é o que o curador precisa ver primeiro. */}
      <PainelDivergencias diff={diff} />
      <ToggleNotificacoes ativoInicial={notificacaoRiscos} />
      <ConfigEscalonamento inicial={config} />
      <EditorMatriz linhas={linhas} />
    </Container>
  );
}
