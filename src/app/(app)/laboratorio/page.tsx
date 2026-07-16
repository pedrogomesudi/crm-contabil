import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { Vitrine } from "./Vitrine";

export const metadata = { title: "Laboratório (temporário)" };

// TEMPORÁRIA: existe só para avaliar o redesign antes de aplicar no sistema. Some quando o
// padrão for aprovado (é tarefa do plano, não "depois a gente tira"). Fora do menu de propósito.
export default async function LaboratorioPage({
  searchParams,
}: {
  searchParams: Promise<{ tela?: string; modo?: string; aba?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") redirect("/");
  const sp = await searchParams;
  return <Vitrine tela={sp.tela ?? "cadastro"} modo={sp.modo ?? "depois"} aba={sp.aba ?? "cadastro"} />;
}
