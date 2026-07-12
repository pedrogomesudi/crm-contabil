import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarTarefas } from "./actions";
import { PainelTarefas } from "./PainelTarefas";

export const metadata = { title: "Tarefas" };

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ responsavel?: string; cliente?: string; departamento?: string; status?: string; prioridade?: string; vista?: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");
  const sp = await searchParams;
  const tarefas = await listarTarefas(sp);
  const colaboradores = await listarColaboradores();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Tarefas" subtitulo="Tarefas internas da equipe" />
      <PainelTarefas tarefas={tarefas} colaboradores={colaboradores} filtros={sp} vista={sp.vista === "kanban" ? "kanban" : "lista"} hoje={hoje} />
    </main>
  );
}
