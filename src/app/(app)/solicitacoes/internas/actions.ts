"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import { estaVencida, ordenarFila, type SolicInternaStatus } from "@/lib/solicitacoes/interna";
import type { Departamento } from "@/lib/clientes/departamentos";

export type InternaView = {
  id: string;
  numero: number;
  origem: Departamento;
  destino: Departamento;
  assunto: string;
  status: SolicInternaStatus;
  prazo: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  solicitanteId: string | null;
  solicitanteNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  tarefaId: string | null;
  vencida: boolean;
};

export type Filtros = {
  destino?: string;
  origem?: string;
  status?: string;
  vencidas?: string;
  minhas?: string;
  semDono?: string;
};

const STATUS = new Set<SolicInternaStatus>(["aberta", "em_andamento", "respondida", "resolvida"]);
const ROTA = "/solicitacoes/internas";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarTarefas(p.papel) ? p : null;
}

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function listarFila(f: Filtros = {}): Promise<InternaView[]> {
  const perfil = await gate();
  if (!perfil) return [];
  const supabase = await createServerSupabase();

  let q = supabase
    .from("solicitacao_interna")
    .select(
      "id, numero, origem, destino, assunto, status, prazo, cliente_id, solicitante_id, responsavel_id, tarefa_id, clientes(razao_social), solicitante:solicitante_id(nome), responsavel:responsavel_id(nome)",
    )
    .order("criado_em", { ascending: false })
    .limit(300);

  if (f.destino) q = q.eq("destino", f.destino);
  if (f.origem) q = q.eq("origem", f.origem);
  if (f.status) q = q.eq("status", f.status);
  if (f.minhas === "1") q = q.eq("responsavel_id", perfil.id);
  if (f.semDono === "1") q = q.is("responsavel_id", null);

  const { data } = await q;
  const hoje = hojeSP();

  const nome = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { nome?: string; razao_social?: string } | null;

  let lista: InternaView[] = (data ?? []).map((s) => ({
    id: s.id as string,
    numero: Number(s.numero),
    origem: s.origem as Departamento,
    destino: s.destino as Departamento,
    assunto: s.assunto as string,
    status: s.status as SolicInternaStatus,
    prazo: (s.prazo as string | null) ?? null,
    clienteId: (s.cliente_id as string | null) ?? null,
    clienteNome: nome(s.clientes)?.razao_social ?? null,
    solicitanteId: (s.solicitante_id as string | null) ?? null,
    solicitanteNome: nome(s.solicitante)?.nome ?? null,
    responsavelId: (s.responsavel_id as string | null) ?? null,
    responsavelNome: nome(s.responsavel)?.nome ?? null,
    tarefaId: (s.tarefa_id as string | null) ?? null,
    vencida: estaVencida(s.status as SolicInternaStatus, (s.prazo as string | null) ?? null, hoje),
  }));

  if (f.vencidas === "1") lista = lista.filter((s) => s.vencida);
  return ordenarFila(lista, hoje);
}

export async function abrirSolicitacaoInterna(input: {
  destino: Departamento;
  origem?: Departamento | null;
  assunto: string;
  mensagem: string;
  clienteId?: string | null;
  responsavelId?: string | null;
}): Promise<{ id?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const assunto = input.assunto.trim().slice(0, 200);
  const mensagem = input.mensagem.trim().slice(0, 4000);
  if (!input.destino) return { erro: "Escolha o departamento de destino." };
  if (!assunto) return { erro: "Informe o assunto." };
  if (!mensagem) return { erro: "Descreva o pedido." };

  const supabase = await createServerSupabase();

  // A origem é o departamento do solicitante; se ele não tiver, usa o escolhido no formulário.
  const { data: u } = await supabase.from("usuarios").select("departamento").eq("id", perfil.id).maybeSingle();
  const origem = ((u?.departamento as Departamento | null) ?? input.origem ?? null) as Departamento | null;
  if (!origem) return { erro: "Informe o seu departamento (origem)." };

  // O PRAZO não é enviado: o gatilho o calcula pelo SLA do destino.
  const { data, error } = await supabase
    .from("solicitacao_interna")
    .insert({
      origem,
      destino: input.destino,
      assunto,
      cliente_id: input.clienteId ?? null,
      responsavel_id: input.responsavelId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao abrir a solicitação." };

  const id = data.id as string;
  await supabase.from("solicitacao_interna_mensagem").insert({ solicitacao_id: id, corpo: mensagem });

  revalidatePath(ROTA);
  return { id };
}

// Assumir só vale se estiver SEM DONO: dois cliques simultâneos não podem trocar o
// responsável pelas costas de quem chegou primeiro.
export async function assumir(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("solicitacao_interna")
    .update({ responsavel_id: perfil.id, status: "em_andamento" })
    .eq("id", id)
    .is("responsavel_id", null)
    .select("id");
  if (error) return { erro: "Falha ao assumir." };
  if (!data || data.length === 0) return { erro: "Alguém já assumiu esta solicitação." };
  revalidatePath(`${ROTA}/${id}`);
  revalidatePath(ROTA);
  return { ok: true };
}

export async function responderInterna(id: string, corpo: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const texto = corpo.trim().slice(0, 4000);
  if (!texto) return { erro: "Escreva a mensagem." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("solicitacao_interna_mensagem").insert({ solicitacao_id: id, corpo: texto });
  if (error) return { erro: "Falha ao enviar a mensagem." };
  await supabase
    .from("solicitacao_interna")
    .update({ status: "respondida" })
    .eq("id", id)
    .in("status", ["aberta", "em_andamento"]);
  revalidatePath(`${ROTA}/${id}`);
  revalidatePath(ROTA);
  return { ok: true };
}

export async function definirStatusInterna(
  id: string,
  status: SolicInternaStatus,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!STATUS.has(status)) return { erro: "Status inválido." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("solicitacao_interna").update({ status }).eq("id", id);
  if (error) return { erro: "Falha ao mudar o status." };
  revalidatePath(`${ROTA}/${id}`);
  revalidatePath(ROTA);
  return { ok: true };
}

export async function definirResponsavelInterno(
  id: string,
  usuarioId: string | null,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("solicitacao_interna").update({ responsavel_id: usuarioId }).eq("id", id);
  if (error) return { erro: "Falha ao atribuir." };
  revalidatePath(`${ROTA}/${id}`);
  revalidatePath(ROTA);
  return { ok: true };
}

export async function converterEmTarefaInterna(id: string): Promise<{ tarefaId?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: s } = await supabase
    .from("solicitacao_interna")
    .select("id, numero, assunto, cliente_id, prazo, responsavel_id, destino, tarefa_id")
    .eq("id", id)
    .maybeSingle();
  if (!s) return { erro: "Solicitação não encontrada." };
  if (s.tarefa_id) return { tarefaId: s.tarefa_id as string };

  const { data: tarefa, error } = await supabase
    .from("tarefa")
    .insert({
      titulo: `Solicitação interna #${String(s.numero)} — ${s.assunto as string}`,
      cliente_id: s.cliente_id,
      responsavel_id: s.responsavel_id,
      departamento: s.destino,
      prazo: s.prazo,
      prioridade: "alta",
    })
    .select("id")
    .single();
  if (error || !tarefa) return { erro: "Falha ao criar a tarefa." };

  await supabase.from("solicitacao_interna").update({ tarefa_id: tarefa.id, status: "em_andamento" }).eq("id", id);

  revalidatePath(`${ROTA}/${id}`);
  revalidatePath("/tarefas");
  return { tarefaId: tarefa.id as string };
}

// Para o Início: uma fila que ninguém abre é onde os pedidos vão morrer.
export async function contadoresFila(): Promise<{ minhaFila: number; vencidas: number }> {
  const perfil = await gate();
  if (!perfil) return { minhaFila: 0, vencidas: 0 };
  const supabase = await createServerSupabase();

  const { data: u } = await supabase.from("usuarios").select("departamento").eq("id", perfil.id).maybeSingle();
  const depto = (u?.departamento as Departamento | null) ?? null;

  const { data } = await supabase
    .from("solicitacao_interna")
    .select("id, destino, status, prazo, responsavel_id")
    .neq("status", "resolvida")
    .limit(500);

  const hoje = hojeSP();
  const abertas = data ?? [];

  // "Minha fila": o que é meu + o que está sem dono no meu departamento.
  const minhaFila = abertas.filter(
    (s) => s.responsavel_id === perfil.id || (s.responsavel_id === null && depto !== null && s.destino === depto),
  ).length;

  const vencidas = abertas.filter((s) =>
    estaVencida(s.status as SolicInternaStatus, (s.prazo as string | null) ?? null, hoje),
  ).length;

  return { minhaFila, vencidas };
}
