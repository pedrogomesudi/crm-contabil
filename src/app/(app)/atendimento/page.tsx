import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeAtender } from "@/lib/clientes/permissoes";
import { Inbox } from "./Inbox";
import { listarConversas } from "./actions";

export default async function AtendimentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeAtender(perfil.papel)) redirect("/");
  const conversas = await listarConversas();
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">Atendimento</h1>
      <Inbox inicial={conversas} />
    </main>
  );
}
