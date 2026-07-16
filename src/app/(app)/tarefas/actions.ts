"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import type { TarefaStatus, TarefaPrioridade } from "@/lib/tarefas/tarefa";
import type { Departamento } from "@/lib/clientes/departamentos";

export type TarefaView = {
  id: string;
  titulo: string;
  responsavelId: string | null;
  responsavelNome: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  departamento: Departamento | null;
  prioridade: TarefaPrioridade;
  prazo: string | null;
  status: TarefaStatus;
};
export type TarefaInput = {
  titulo: string;
  descricao: string | null;
  responsavelId: string | null;
  clienteId: string | null;
  departamento: Departamento | null;
  prioridade: TarefaPrioridade;
  prazo: string | null;
};

const STATUS = new Set<TarefaStatus>(["aberta", "em_andamento", "concluida", "cancelada"]);

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarTarefas(p.papel)) return null;
  return p;
}

export async function listarTarefas(
  f: { responsavel?: string; cliente?: string; departamento?: string; status?: string; prioridade?: string } = {},
): Promise<TarefaView[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  let q = supabase
    .from("tarefa")
    .select("id, titulo, responsavel_id, cliente_id, departamento, prioridade, prazo, status")
    .order("criado_em", { ascending: false })
    .limit(500);
  if (f.responsavel) q = q.eq("responsavel_id", f.responsavel);
  if (f.cliente) q = q.eq("cliente_id", f.cliente);
  if (f.departamento) q = q.eq("departamento", f.departamento);
  if (f.status) q = q.eq("status", f.status);
  if (f.prioridade) q = q.eq("prioridade", f.prioridade);
  const { data: rows } = await q;
  const tarefas = rows ?? [];

  const colaboradores = await listarColaboradores();
  const nomeUsr = new Map<string, string>(colaboradores.map((c) => [c.id, c.nome]));
  const cliIds = [...new Set(tarefas.map((t) => t.cliente_id as string | null).filter(Boolean) as string[])];
  const { data: clientes } = cliIds.length
    ? await supabase.from("clientes").select("id, razao_social").in("id", cliIds)
    : { data: [] };
  const nomeCli = new Map<string, string>(
    (clientes ?? []).map((c) => [c.id as string, (c.razao_social as string) ?? "—"]),
  );

  return tarefas.map((t) => ({
    id: t.id as string,
    titulo: t.titulo as string,
    responsavelId: (t.responsavel_id as string | null) ?? null,
    responsavelNome: t.responsavel_id ? (nomeUsr.get(t.responsavel_id as string) ?? null) : null,
    clienteId: (t.cliente_id as string | null) ?? null,
    clienteNome: t.cliente_id ? (nomeCli.get(t.cliente_id as string) ?? null) : null,
    departamento: (t.departamento as Departamento | null) ?? null,
    prioridade: t.prioridade as TarefaPrioridade,
    prazo: (t.prazo as string | null) ?? null,
    status: t.status as TarefaStatus,
  }));
}

export async function criarTarefa(input: TarefaInput): Promise<{ id?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const titulo = input.titulo.trim().slice(0, 200);
  if (!titulo) return { erro: "Informe o título." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tarefa")
    .insert({
      titulo,
      descricao: input.descricao,
      responsavel_id: input.responsavelId,
      cliente_id: input.clienteId,
      departamento: input.departamento,
      prioridade: input.prioridade,
      prazo: input.prazo,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao criar a tarefa." };
  revalidatePath("/tarefas");
  return { id: data.id as string };
}

export async function salvarTarefa(id: string, input: TarefaInput): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const titulo = input.titulo.trim().slice(0, 200);
  if (!titulo) return { erro: "Informe o título." };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tarefa")
    .update({
      titulo,
      descricao: input.descricao,
      responsavel_id: input.responsavelId,
      cliente_id: input.clienteId,
      departamento: input.departamento,
      prioridade: input.prioridade,
      prazo: input.prazo,
    })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar (você pode editar apenas as suas tarefas)." };
  revalidatePath(`/tarefas/${id}`);
  revalidatePath("/tarefas");
  return { ok: true };
}

export async function definirStatusTarefa(id: string, status: TarefaStatus): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!STATUS.has(status)) return { erro: "Status inválido." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tarefa").update({ status }).eq("id", id);
  if (error) return { erro: "Falha ao mudar o status." };
  revalidatePath(`/tarefas/${id}`);
  revalidatePath("/tarefas");
  return { ok: true };
}

export async function excluirTarefa(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tarefa").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath("/tarefas");
  return { ok: true };
}

export async function salvarItem(input: {
  id?: string;
  tarefaId: string;
  descricao: string;
}): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const descricao = input.descricao.trim().slice(0, 300);
  if (!descricao) return { erro: "Informe o item." };
  const supabase = await createServerSupabase();
  if (input.id) {
    const { error } = await supabase.from("tarefa_item").update({ descricao }).eq("id", input.id);
    if (error) return { erro: "Falha ao salvar o item." };
  } else {
    const { data: maxRow } = await supabase
      .from("tarefa_item")
      .select("ordem")
      .eq("tarefa_id", input.tarefaId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordem = ((maxRow?.ordem as number | undefined) ?? 0) + 1;
    const { error } = await supabase.from("tarefa_item").insert({ tarefa_id: input.tarefaId, descricao, ordem });
    if (error) return { erro: "Falha ao criar o item." };
  }
  revalidatePath(`/tarefas/${input.tarefaId}`);
  return { ok: true };
}

export async function alternarItem(id: string, feito: boolean): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: it } = await supabase.from("tarefa_item").select("tarefa_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("tarefa_item").update({ feito }).eq("id", id);
  if (error) return { erro: "Falha ao atualizar o item." };
  if (it) revalidatePath(`/tarefas/${it.tarefa_id}`);
  return { ok: true };
}

export async function excluirItem(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: it } = await supabase.from("tarefa_item").select("tarefa_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("tarefa_item").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir o item." };
  if (it) revalidatePath(`/tarefas/${it.tarefa_id}`);
  return { ok: true };
}
