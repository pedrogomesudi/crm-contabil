import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { PainelRiscosView } from "./PainelRiscosView";
import { listarRiscos } from "../actions";

export default async function RiscosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const painel = await listarRiscos();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="mx-auto max-w-[1280px] space-y-5 p-4">
      <PageHeader titulo="Riscos de obrigações" subtitulo="Vencendo hoje, vencidas e sem responsável" />
      <PainelRiscosView painel={painel} hoje={hoje} />
    </main>
  );
}
