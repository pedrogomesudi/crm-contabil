import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeAtender } from "@/lib/clientes/permissoes";
import { Inbox } from "./Inbox";
import { listarConversas } from "./actions";

export default async function AtendimentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeAtender(perfil.papel)) redirect("/");
  const conversas = await listarConversas();
  // Cancela o padding do <main> e preenche a viewport. Offset do topo mobile é a barra da Sidebar.
  //
  // `svh` e não `dvh`: a viewport MENOR é estável, enquanto a dinâmica muda quando a barra do
  // navegador se esconde ao rolar — e altura que muda sozinha faz o conteúdo pular. Não foi isto
  // que derrubava a tela no iPhone (era a CSP bloqueando o WebSocket, ver next.config.ts); `svh`
  // ficou por ser a unidade certa para contêiner de altura fixa, não como correção daquele bug.
  return (
    <div className="-m-4 h-[calc(100svh-3.5rem)] overflow-x-hidden md:-m-6 md:h-screen">
      <Inbox inicial={conversas} />
    </div>
  );
}
