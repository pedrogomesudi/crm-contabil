import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { VerificarMfa } from "./VerificarMfa";

export const metadata = { title: "Verificação em duas etapas" };

export default async function VerificarPage() {
  // Precisa de sessão (aal1) para haver fator a desafiar. Sem perfil => volta ao login.
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  return <VerificarMfa />;
}
