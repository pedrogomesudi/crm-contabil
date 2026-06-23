import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { NovaSenhaForm } from "@/components/NovaSenhaForm";

export const metadata = { title: "Definir nova senha" };

// Só acessível com sessão (de recuperação/convite) criada pelo /auth/confirmar.
// Usuário desativado não conclui o fluxo (simétrico ao bloqueio do login/layout).
export default async function RedefinirSenhaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  if (!perfil.ativo) redirect("/login?erro=conta_inativa");
  return <NovaSenhaForm />;
}
