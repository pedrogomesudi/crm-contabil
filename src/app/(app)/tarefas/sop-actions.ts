"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { progressoProcesso } from "@/lib/tarefas/sop";

export type ProcessoView = {
  id: string;
  templateNome: string;
  clienteId: string | null;
  clienteNome: string | null;
  dataInicio: string;
  ondaAtual: number;
  status: "em_andamento" | "concluido" | "cancelado";
  feitas: number;
  total: number;
  pct: number;
};

export type ModeloOpcao = { id: string; nome: string };

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarTarefas(p.papel) ? p : null;
}

export async function listarModelosAtivos(): Promise<ModeloOpcao[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("sop_template").select("id, nome").eq("ativo", true).order("nome");
  return (data ?? []).map((t) => ({ id: t.id as string, nome: t.nome as string }));
}

// clienteId undefined = todos; null = só os internos (sem cliente).
export async function listarProcessos(clienteId?: string | null): Promise<ProcessoView[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  let q = supabase
    .from("sop_processo")
    .select("id, cliente_id, data_inicio, onda_atual, status, sop_template(nome), clientes(razao_social)")
    .order("criado_em", { ascending: false })
    .limit(50);
  if (clienteId === null) q = q.is("cliente_id", null);
  else if (clienteId) q = q.eq("cliente_id", clienteId);
  const { data } = await q;
  const processos = data ?? [];
  if (processos.length === 0) return [];

  const ids = processos.map((p) => p.id as string);
  const { data: tarefas } = await supabase.from("tarefa").select("sop_processo_id, status").in("sop_processo_id", ids);

  return processos.map((p) => {
    const t = Array.isArray(p.sop_template) ? p.sop_template[0] : p.sop_template;
    const cl = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes;
    const doProcesso = (tarefas ?? []).filter((x) => x.sop_processo_id === p.id);
    const prog = progressoProcesso(doProcesso as { status: string }[]);
    return {
      id: p.id as string,
      templateNome: (t as { nome?: string } | null)?.nome ?? "—",
      clienteId: (p.cliente_id as string | null) ?? null,
      clienteNome: (cl as { razao_social?: string } | null)?.razao_social ?? null,
      dataInicio: p.data_inicio as string,
      ondaAtual: p.onda_atual as number,
      status: p.status as ProcessoView["status"],
      ...prog,
    };
  });
}

export async function iniciarProcessoSop(input: {
  templateId: string;
  clienteId: string | null;
  dataInicio: string;
}): Promise<{ id?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!input.templateId) return { erro: "Escolha o modelo." };
  if (!input.dataInicio) return { erro: "Informe a data de início." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("sop_processo")
    .insert({ template_id: input.templateId, cliente_id: input.clienteId, data_inicio: input.dataInicio })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao iniciar o processo." };

  // A onda 1 nasce agora; as seguintes nascem sozinhas, pelo trigger, quando a anterior fecha.
  const { error: errGerar } = await supabase.rpc("sop_gerar_onda", {
    p_processo: data.id as string,
    p_onda: 1,
  });
  if (errGerar) return { erro: "Processo criado, mas as tarefas da primeira onda não foram geradas." };

  revalidatePath("/tarefas");
  if (input.clienteId) revalidatePath(`/clientes/${input.clienteId}`);
  return { id: data.id as string };
}
