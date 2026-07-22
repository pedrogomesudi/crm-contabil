import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { ehCliente } from "@/lib/portal/permissoes";
import { ContaSeguranca } from "./ContaSeguranca";

export const metadata = { title: "Segurança — 2FA" };

export default async function ContaSegurancaPage() {
  // Só equipe (admin/contador/assistente/financeiro). Cliente do portal não tem 2FA no v1.
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || ehCliente(perfil.papel)) redirect("/");
  return <ContaSeguranca />;
}
