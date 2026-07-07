import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeAtender } from "@/lib/clientes/permissoes";
import { Inbox } from "./Inbox";
import { listarConversas } from "./actions";

export default async function AtendimentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeAtender(perfil.papel)) redirect("/");
  const conversas = await listarConversas();
  // Cancela o padding do <main> e preenche a viewport. Offset do topo mobile ajustado no dev-server.
  return (
    <div className="-m-4 h-[calc(100dvh-3.5rem)] md:-m-6 md:h-screen">
      <Inbox inicial={conversas} />
    </div>
  );
}
