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
  // `svh`, NÃO `dvh`: a altura dinâmica muda quando a barra do navegador se esconde ao rolar, e no
  // iOS isso realimenta o layout — a barra some, a altura cresce, o conteúdo reflui, a barra volta.
  // O WebKit recalcula até o sistema encerrar a aba, e a tela vira "This page couldn't load". Só
  // acontece em celular, porque só ali a barra se esconde. `svh` é a viewport MENOR: estável.
  return (
    <div className="-m-4 h-[calc(100svh-3.5rem)] overflow-x-hidden md:-m-6 md:h-screen">
      <Inbox inicial={conversas} />
    </div>
  );
}
