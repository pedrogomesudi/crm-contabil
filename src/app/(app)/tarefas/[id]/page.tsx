import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorTarefa } from "./EditorTarefa";
import { HorasDaTarefa } from "@/components/timesheet/HorasDaTarefa";
import { sessaoAtual } from "@/app/(app)/timesheet/actions";
import type { TarefaPrioridade, TarefaStatus } from "@/lib/tarefas/tarefa";
import type { Departamento } from "@/lib/clientes/departamentos";

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data: t } = await supabase
    .from("tarefa")
    .select("id, titulo, descricao, responsavel_id, cliente_id, departamento, prioridade, prazo, status")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const { data: itens } = await supabase
    .from("tarefa_item")
    .select("id, descricao, feito, ordem")
    .eq("tarefa_id", id)
    .order("ordem");
  const colaboradores = await listarColaboradores();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .is("excluido_em", null)
    .order("razao_social")
    .limit(300);

  // Horas: a RLS soma só o que o usuário pode ver (as suas; admin/financeiro veem todas).
  const { data: horas } = await supabase.from("apontamento").select("minutos").eq("tarefa_id", id);
  const minutosTotal = (horas ?? []).reduce((s, h) => s + (h.minutos as number), 0);
  const sessao = await sessaoAtual();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const tarefa = {
    id: t.id as string,
    titulo: t.titulo as string,
    descricao: (t.descricao as string | null) ?? "",
    responsavelId: (t.responsavel_id as string | null) ?? "",
    clienteId: (t.cliente_id as string | null) ?? "",
    departamento: ((t.departamento as Departamento | null) ?? "") as string,
    prioridade: t.prioridade as TarefaPrioridade,
    prazo: (t.prazo as string | null) ?? "",
    status: t.status as TarefaStatus,
    itens: (itens ?? []).map((i) => ({
      id: i.id as string,
      descricao: i.descricao as string,
      feito: i.feito as boolean,
    })),
  };
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <Link href="/tarefas" className="text-sm text-verde underline">
        ← Tarefas
      </Link>
      <PageHeader titulo="Tarefa" />
      <EditorTarefa
        tarefa={tarefa}
        colaboradores={colaboradores}
        clientes={(clientes ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }))}
      />
      <HorasDaTarefa
        tarefaId={id}
        minutosTotal={minutosTotal}
        sessaoNesta={sessao?.tarefaId === id}
        minutosSessao={sessao?.minutos ?? 0}
        hoje={hoje}
      />
    </main>
  );
}
