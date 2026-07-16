"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeAtenderSolicitacoes } from "@/lib/clientes/permissoes";
import type { SolicitacaoStatus } from "@/lib/solicitacoes/solicitacao";

const STATUS = new Set<SolicitacaoStatus>(["aberta", "em_andamento", "respondida", "resolvida"]);

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeAtenderSolicitacoes(p.papel)) return null;
  return p;
}

function revalida(id: string) {
  revalidatePath(`/solicitacoes/${id}`);
  revalidatePath("/solicitacoes");
}

// Responder marca a solicitação como 'respondida' quando ela ainda está aberta/em andamento.
export async function responder(id: string, corpo: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const texto = corpo.trim().slice(0, 4000);
  if (!texto) return { erro: "Escreva a mensagem." };
  const supabase = await createServerSupabase();
  // A autoria é forçada pelo gatilho; a RLS confirma o vínculo com a solicitação.
  const { error } = await supabase.from("solicitacao_mensagem").insert({ solicitacao_id: id, corpo: texto });
  if (error) return { erro: "Falha ao enviar a mensagem." };
  await supabase
    .from("solicitacao")
    .update({ status: "respondida" })
    .eq("id", id)
    .in("status", ["aberta", "em_andamento"]);
  revalida(id);
  return { ok: true };
}

export async function definirStatus(id: string, status: SolicitacaoStatus): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!STATUS.has(status)) return { erro: "Status inválido." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("solicitacao").update({ status }).eq("id", id);
  if (error) return { erro: "Falha ao mudar o status." };
  revalida(id);
  return { ok: true };
}

export async function definirResponsavel(
  id: string,
  responsavelId: string | null,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("solicitacao").update({ responsavel_id: responsavelId }).eq("id", id);
  if (error) return { erro: "Falha ao atribuir o responsável." };
  revalida(id);
  return { ok: true };
}

// Cria uma tarefa interna a partir da solicitação e guarda o vínculo (tarefa_id).
export async function converterEmTarefa(id: string): Promise<{ tarefaId?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: s } = await supabase
    .from("solicitacao")
    .select("id, numero, assunto, cliente_id, prazo, responsavel_id, tarefa_id")
    .eq("id", id)
    .maybeSingle();
  if (!s) return { erro: "Solicitação não encontrada." };
  if (s.tarefa_id) return { tarefaId: s.tarefa_id as string };

  const { data: tarefa, error } = await supabase
    .from("tarefa")
    .insert({
      titulo: `Solicitação #${String(s.numero)} — ${s.assunto as string}`,
      cliente_id: s.cliente_id,
      responsavel_id: s.responsavel_id,
      prazo: s.prazo,
      prioridade: "alta",
    })
    .select("id")
    .single();
  if (error || !tarefa) return { erro: "Falha ao criar a tarefa." };

  await supabase.from("solicitacao").update({ tarefa_id: tarefa.id, status: "em_andamento" }).eq("id", id);
  revalida(id);
  revalidatePath("/tarefas");
  return { tarefaId: tarefa.id as string };
}
