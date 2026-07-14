import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarTarefas } from "./actions";
import { PainelTarefas } from "./PainelTarefas";
import { ProcessosSop } from "@/components/tarefas/ProcessosSop";
import { listarModelosAtivos, listarProcessos } from "./sop-actions";

export const metadata = { title: "Tarefas" };

type Vista = "lista" | "kanban" | "calendario";

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{
    responsavel?: string;
    cliente?: string;
    departamento?: string;
    status?: string;
    prioridade?: string;
    vista?: string;
    ano?: string;
    mes?: string;
  }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");
  const sp = await searchParams;
  const tarefas = await listarTarefas(sp);
  const colaboradores = await listarColaboradores();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const modelos = await listarModelosAtivos();
  const processos = await listarProcessos(null); // internos (sem cliente)

  const vista: Vista = sp.vista === "kanban" ? "kanban" : sp.vista === "calendario" ? "calendario" : "lista";
  const anoHoje = Number(hoje.slice(0, 4));
  const mesHoje = Number(hoje.slice(5, 7));
  const ano = Number(sp.ano) || anoHoje;
  const mes = Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : mesHoje;

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <PageHeader titulo="Tarefas" subtitulo="Tarefas internas da equipe" />
      <PainelTarefas
        tarefas={tarefas}
        colaboradores={colaboradores}
        filtros={sp}
        vista={vista}
        hoje={hoje}
        ano={ano}
        mes={mes}
      />
      <ProcessosSop clienteId={null} modelos={modelos} processos={processos} hoje={hoje} />
    </main>
  );
}
