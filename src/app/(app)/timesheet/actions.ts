"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { duracaoSessao } from "@/lib/timesheet/apontamento";

export type ApontamentoView = {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  clienteId: string | null;
  clienteNome: string | null;
  tarefaId: string | null;
  tarefaTitulo: string | null;
  data: string;
  minutos: number;
  descricao: string | null;
  origem: "manual" | "cronometro";
};

export type SessaoView = {
  iniciadoEm: string;
  clienteId: string | null;
  tarefaId: string | null;
  tarefaTitulo: string | null;
  minutos: number;
  suspeita: boolean;
};

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarTarefas(p.papel) ? p : null;
}

export async function listarApontamentos(f: {
  de: string;
  ate: string;
  usuarioId?: string;
  clienteId?: string;
}): Promise<ApontamentoView[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();

  // A RLS já escopa: quem não é admin/financeiro só enxerga os próprios apontamentos.
  let q = supabase
    .from("apontamento")
    .select("id, usuario_id, cliente_id, tarefa_id, data, minutos, descricao, origem, usuarios(nome), clientes(razao_social), tarefa(titulo)")
    .gte("data", f.de)
    .lte("data", f.ate)
    .order("data", { ascending: false })
    .limit(500);
  if (f.usuarioId) q = q.eq("usuario_id", f.usuarioId);
  if (f.clienteId) q = q.eq("cliente_id", f.clienteId);

  const { data } = await q;
  return (data ?? []).map((a) => {
    const u = Array.isArray(a.usuarios) ? a.usuarios[0] : a.usuarios;
    const c = Array.isArray(a.clientes) ? a.clientes[0] : a.clientes;
    const t = Array.isArray(a.tarefa) ? a.tarefa[0] : a.tarefa;
    return {
      id: a.id as string,
      usuarioId: a.usuario_id as string,
      usuarioNome: (u as { nome?: string } | null)?.nome ?? "—",
      clienteId: (a.cliente_id as string | null) ?? null,
      clienteNome: (c as { razao_social?: string } | null)?.razao_social ?? null,
      tarefaId: (a.tarefa_id as string | null) ?? null,
      tarefaTitulo: (t as { titulo?: string } | null)?.titulo ?? null,
      data: a.data as string,
      minutos: a.minutos as number,
      descricao: (a.descricao as string | null) ?? null,
      origem: a.origem as "manual" | "cronometro",
    };
  });
}

export async function salvarApontamento(input: {
  id?: string;
  data: string;
  minutos: number;
  clienteId: string | null;
  tarefaId: string | null;
  descricao: string | null;
}): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!input.data) return { erro: "Informe a data." };
  if (!Number.isInteger(input.minutos) || input.minutos <= 0 || input.minutos > 1440) {
    return { erro: "Duração inválida (use algo como 1h30, 1:30 ou 90)." };
  }

  const supabase = await createServerSupabase();

  // Apontar numa tarefa herda o cliente dela — evita hora que não entra em custo nenhum
  // por esquecimento de preencher o cliente.
  let clienteId = input.clienteId;
  if (!clienteId && input.tarefaId) {
    const { data: t } = await supabase.from("tarefa").select("cliente_id").eq("id", input.tarefaId).maybeSingle();
    clienteId = (t?.cliente_id as string | null) ?? null;
  }

  const row = {
    data: input.data,
    minutos: input.minutos,
    cliente_id: clienteId,
    tarefa_id: input.tarefaId,
    descricao: input.descricao,
  };
  const { error } = input.id
    ? await supabase.from("apontamento").update(row).eq("id", input.id)
    : await supabase.from("apontamento").insert({ ...row, usuario_id: perfil.id, origem: "manual" });
  if (error) return { erro: "Falha ao salvar o apontamento." };

  revalidatePath("/timesheet");
  if (input.tarefaId) revalidatePath(`/tarefas/${input.tarefaId}`);
  return { ok: true };
}

export async function excluirApontamento(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("apontamento").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function sessaoAtual(): Promise<SessaoView | null> {
  const perfil = await gate();
  if (!perfil) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("apontamento_sessao")
    .select("iniciado_em, cliente_id, tarefa_id, tarefa(titulo)")
    .maybeSingle();
  if (!data) return null;

  const t = Array.isArray(data.tarefa) ? data.tarefa[0] : data.tarefa;
  const d = duracaoSessao(data.iniciado_em as string, new Date().toISOString());
  return {
    iniciadoEm: data.iniciado_em as string,
    clienteId: (data.cliente_id as string | null) ?? null,
    tarefaId: (data.tarefa_id as string | null) ?? null,
    tarefaTitulo: (t as { titulo?: string } | null)?.titulo ?? null,
    minutos: d.minutos,
    suspeita: d.suspeita,
  };
}

export async function iniciarCronometro(input: {
  tarefaId?: string | null;
  clienteId?: string | null;
}): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  // Se já há sessão, NÃO sobrescrever: o tempo já corrido se perderia em silêncio.
  const { data: atual } = await supabase.from("apontamento_sessao").select("iniciado_em").maybeSingle();
  if (atual) return { erro: "Já existe um cronômetro em andamento. Pare-o antes de iniciar outro." };

  let clienteId = input.clienteId ?? null;
  if (!clienteId && input.tarefaId) {
    const { data: t } = await supabase.from("tarefa").select("cliente_id").eq("id", input.tarefaId).maybeSingle();
    clienteId = (t?.cliente_id as string | null) ?? null;
  }

  const { error } = await supabase.from("apontamento_sessao").insert({
    usuario_id: perfil.id,
    tarefa_id: input.tarefaId ?? null,
    cliente_id: clienteId,
  });
  if (error) return { erro: "Falha ao iniciar o cronômetro." };

  revalidatePath("/timesheet");
  if (input.tarefaId) revalidatePath(`/tarefas/${input.tarefaId}`);
  return { ok: true };
}

// Sessão suspeita (>8h) NÃO é gravada em silêncio: devolve `confirmar` para a tela pedir
// o valor ao operador. Gravar 14h fantasma destruiria a margem do cliente sem explicação.
export async function pararCronometro(
  minutosInformados?: number,
): Promise<{ ok?: boolean; erro?: string; confirmar?: { minutos: number } }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const { data: s } = await supabase
    .from("apontamento_sessao")
    .select("iniciado_em, cliente_id, tarefa_id")
    .maybeSingle();
  if (!s) return { erro: "Nenhum cronômetro em andamento." };

  const d = duracaoSessao(s.iniciado_em as string, new Date().toISOString());
  const minutos = minutosInformados ?? d.minutos;

  if (minutosInformados === undefined && d.suspeita) {
    return { confirmar: { minutos: d.minutos } };
  }
  if (!Number.isInteger(minutos) || minutos <= 0 || minutos > 1440) {
    return { erro: "Duração inválida." };
  }

  const { error } = await supabase.from("apontamento").insert({
    usuario_id: perfil.id,
    cliente_id: s.cliente_id,
    tarefa_id: s.tarefa_id,
    data: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    minutos,
    origem: "cronometro",
  });
  if (error) return { erro: "Falha ao gravar o apontamento." };

  await supabase.from("apontamento_sessao").delete().eq("usuario_id", perfil.id);

  revalidatePath("/timesheet");
  if (s.tarefa_id) revalidatePath(`/tarefas/${s.tarefa_id}`);
  return { ok: true };
}

export async function podeVerDeTodos(): Promise<boolean> {
  const p = await getPerfilAtual();
  return Boolean(p?.ativo && podeGerenciarFinanceiro(p.papel));
}
