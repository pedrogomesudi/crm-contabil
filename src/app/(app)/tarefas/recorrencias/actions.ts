"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarRecorrencias } from "@/lib/clientes/permissoes";
import { processarRecorrencias, type ResumoRecorrencia } from "@/lib/tarefas/recorrencia-motor";
import type { Periodicidade } from "@/lib/tarefas/recorrencia";
import type { TarefaPrioridade } from "@/lib/tarefas/tarefa";
import type { Departamento } from "@/lib/clientes/departamentos";

export type RecorrenciaView = {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavelId: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  departamento: Departamento | null;
  prioridade: TarefaPrioridade;
  periodicidade: Periodicidade;
  diaSemana: number | null;
  diaMes: number | null;
  mes: number | null;
  antecedenciaDias: number;
  proximaData: string;
  ativa: boolean;
  itens: string[];
};

export type RecorrenciaInput = {
  id?: string;
  titulo: string;
  descricao: string | null;
  responsavelId: string | null;
  clienteId: string | null;
  departamento: Departamento | null;
  prioridade: TarefaPrioridade;
  periodicidade: Periodicidade;
  diaSemana: number | null;
  diaMes: number | null;
  mes: number | null;
  antecedenciaDias: number;
  proximaData: string;
  ativa: boolean;
  itens: string[];
};

const ROTA = "/tarefas/recorrencias";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarRecorrencias(p.papel) ? p : null;
}

export async function listarRecorrencias(): Promise<RecorrenciaView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tarefa_recorrencia")
    .select(
      "id, titulo, descricao, responsavel_id, cliente_id, departamento, prioridade, periodicidade, dia_semana, dia_mes, mes, antecedencia_dias, proxima_data, ativa, clientes(razao_social), tarefa_recorrencia_item(descricao, ordem)",
    )
    .order("proxima_data");

  return (data ?? []).map((r) => {
    const cl = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes;
    const itens = ((r.tarefa_recorrencia_item ?? []) as { descricao: string; ordem: number }[])
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => i.descricao);
    return {
      id: r.id as string,
      titulo: r.titulo as string,
      descricao: (r.descricao as string | null) ?? null,
      responsavelId: (r.responsavel_id as string | null) ?? null,
      clienteId: (r.cliente_id as string | null) ?? null,
      clienteNome: (cl as { razao_social?: string } | null)?.razao_social ?? null,
      departamento: (r.departamento as Departamento | null) ?? null,
      prioridade: r.prioridade as TarefaPrioridade,
      periodicidade: r.periodicidade as Periodicidade,
      diaSemana: (r.dia_semana as number | null) ?? null,
      diaMes: (r.dia_mes as number | null) ?? null,
      mes: (r.mes as number | null) ?? null,
      antecedenciaDias: r.antecedencia_dias as number,
      proximaData: r.proxima_data as string,
      ativa: r.ativa as boolean,
      itens,
    };
  });
}

export async function salvarRecorrencia(input: RecorrenciaInput): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const titulo = input.titulo.trim().slice(0, 200);
  if (!titulo) return { erro: "Informe o título." };
  if (!input.proximaData) return { erro: "Informe a data da próxima ocorrência." };
  if (input.periodicidade === "semanal" && input.diaSemana === null) return { erro: "Escolha o dia da semana." };
  if (input.periodicidade !== "semanal" && !input.diaMes) return { erro: "Informe o dia do mês." };
  if (input.periodicidade === "anual" && !input.mes) return { erro: "Informe o mês." };

  const supabase = await createServerSupabase();
  const row = {
    titulo,
    descricao: input.descricao,
    responsavel_id: input.responsavelId,
    cliente_id: input.clienteId,
    departamento: input.departamento,
    prioridade: input.prioridade,
    periodicidade: input.periodicidade,
    dia_semana: input.periodicidade === "semanal" ? input.diaSemana : null,
    dia_mes: input.periodicidade === "semanal" ? null : input.diaMes,
    mes: input.periodicidade === "anual" ? input.mes : null,
    antecedencia_dias: input.antecedenciaDias,
    proxima_data: input.proximaData,
    ativa: input.ativa,
    atualizado_em: new Date().toISOString(),
  };

  const { data, error } = input.id
    ? await supabase.from("tarefa_recorrencia").update(row).eq("id", input.id).select("id").single()
    : await supabase.from("tarefa_recorrencia").insert(row).select("id").single();
  if (error || !data) return { erro: "Falha ao salvar a recorrência." };

  const id = data.id as string;
  await supabase.from("tarefa_recorrencia_item").delete().eq("recorrencia_id", id);
  const itens = input.itens.map((d) => d.trim()).filter(Boolean);
  if (itens.length > 0) {
    await supabase
      .from("tarefa_recorrencia_item")
      .insert(itens.map((descricao, ordem) => ({ recorrencia_id: id, descricao, ordem })));
  }

  revalidatePath(ROTA);
  return { ok: true };
}

export async function excluirRecorrencia(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tarefa_recorrencia").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath(ROTA);
  return { ok: true };
}

// Espelha o "Processar agora" da régua: sem isto, só dá para testar esperando o cron do dia seguinte.
export async function gerarAgora(): Promise<{ resumo?: ResumoRecorrencia; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const resumo = await processarRecorrencias(hoje);
  revalidatePath(ROTA);
  revalidatePath("/tarefas");
  return { resumo };
}
