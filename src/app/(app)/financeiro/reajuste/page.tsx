import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { ReajusteLote } from "./ReajusteLote";

export const metadata = { title: "Reajuste de honorários" };

export default async function ReajustePage() {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo) redirect("/login");
  if (!podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-texto">Reajuste anual de honorários</h1>
      <ReajusteLote />
    </div>
  );
}
