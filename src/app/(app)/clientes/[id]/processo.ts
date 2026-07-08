"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeRevelarCredencial } from "@/lib/clientes/permissoes";
import { cifrarSenha, decifrarSenha } from "@/lib/onboarding/credencial";
import { materializarProcesso, progressoProcesso, type PerfilCliente, type FlagsProcesso, type StatusItem, type TemplateBloco, type TemplateItem } from "@/lib/onboarding/processo";

export type ItemProcessoView = { id: string; blocoOrdem: number; blocoNome: string; codigo: string | null; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; responsavelId: string | null; prazo: string | null; status: StatusItem; observacao: string | null; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number; acessoUrl: string | null; acessoLogin: string | null; temSenha: boolean };
export type ProcessoView = { id: string; perfil: string; dataInicio: string; status: string } | null;

export async function listarProcessoCliente(clienteId: string): Promise<{ processo: ProcessoView; itens: ItemProcessoView[]; progresso: ReturnType<typeof progressoProcesso> } | null> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data: proc } = await supabase.from("onboarding_processo").select("id, perfil, data_inicio, status").eq("cliente_id", clienteId).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (!proc) return { processo: null, itens: [], progresso: progressoProcesso([]) };
  const { data } = await supabase.from("onboarding_processo_item").select("id, bloco_ordem, bloco_nome, codigo, titulo, descricao, tipo, responsavel_papel, responsavel_id, prazo, status, observacao, bloqueante, anexo_obrigatorio, alerta_risco, ordem, acesso_url, acesso_login, acesso_senha_cifrada").eq("processo_id", proc.id).order("bloco_ordem").order("ordem");
  const itens: ItemProcessoView[] = (data ?? []).map((r) => ({ id: r.id as string, blocoOrdem: r.bloco_ordem as number, blocoNome: r.bloco_nome as string, codigo: r.codigo as string | null, titulo: r.titulo as string, descricao: r.descricao as string | null, tipo: r.tipo as "padrao" | "acesso", responsavelPapel: r.responsavel_papel as string | null, responsavelId: (r.responsavel_id as string | null) ?? null, prazo: (r.prazo as string | null) ?? null, status: r.status as StatusItem, observacao: (r.observacao as string | null) ?? null, bloqueante: r.bloqueante as boolean, anexoObrigatorio: r.anexo_obrigatorio as boolean, alertaRisco: r.alerta_risco as string | null, ordem: r.ordem as number, acessoUrl: (r.acesso_url as string | null) ?? null, acessoLogin: (r.acesso_login as string | null) ?? null, temSenha: !!r.acesso_senha_cifrada }));
  const progresso = progressoProcesso(itens.map((i) => ({ status: i.status, prazo: i.prazo, bloqueante: i.bloqueante })));
  return { processo: { id: proc.id as string, perfil: proc.perfil as string, dataInicio: proc.data_inicio as string, status: proc.status as string }, itens, progresso };
}

export async function iniciarProcesso(clienteId: string, perfil: PerfilCliente, flags: FlagsProcesso, dataInicio: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("onboarding_processo").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId);
  if ((count ?? 0) > 0) return { ok: true };
  const { data: tpl } = await supabase.from("onboarding_template").select("id").eq("ativo", true).order("criado_em").limit(1).maybeSingle();
  if (!tpl) return { erro: "Nenhum template configurado (Configurações → Template de onboarding)." };
  const { data: blocosRows } = await supabase.from("onboarding_bloco").select("id, ordem, nome, prazo_bloco_dias").eq("template_id", tpl.id).order("ordem");
  const { data: itensRows } = await supabase.from("onboarding_template_item").select("bloco_id, codigo, titulo, descricao, tipo, responsavel_papel, prazo_dias, aplicavel_a, condicao_flags, condicao_modo, bloqueante, anexo_obrigatorio, alerta_risco, ordem").in("bloco_id", (blocosRows ?? []).map((b) => b.id as string)).order("ordem");
  const blocos: TemplateBloco[] = (blocosRows ?? []).map((b) => ({
    ordem: b.ordem as number,
    nome: b.nome as string,
    prazoBlocoDias: b.prazo_bloco_dias as number | null,
    itens: (itensRows ?? []).filter((i) => i.bloco_id === b.id).map((i): TemplateItem => ({ codigo: i.codigo as string, titulo: i.titulo as string, descricao: i.descricao as string | null, tipo: i.tipo as "padrao" | "acesso", responsavelPapel: i.responsavel_papel as string | null, prazoDias: i.prazo_dias as number | null, aplicavelA: (i.aplicavel_a as string[]) ?? [], condicaoFlags: (i.condicao_flags as string[]) ?? [], condicaoModo: i.condicao_modo as "any" | "all", bloqueante: i.bloqueante as boolean, anexoObrigatorio: i.anexo_obrigatorio as boolean, alertaRisco: i.alerta_risco as string | null, ordem: i.ordem as number })),
  }));
  const seeds = materializarProcesso(blocos, perfil, flags, dataInicio);
  const { data: novo, error: e1 } = await supabase.from("onboarding_processo").insert({ cliente_id: clienteId, template_id: tpl.id, data_inicio: dataInicio, perfil, flags, criado_por: p.id }).select("id").single();
  if (e1 || !novo) return { erro: "Falha ao criar processo." };
  const linhas = seeds.map((s) => ({ processo_id: novo.id, bloco_ordem: s.blocoOrdem, bloco_nome: s.blocoNome, codigo: s.codigo, titulo: s.titulo, descricao: s.descricao, tipo: s.tipo, responsavel_papel: s.responsavelPapel, prazo: s.prazo, bloqueante: s.bloqueante, anexo_obrigatorio: s.anexoObrigatorio, alerta_risco: s.alertaRisco, ordem: s.ordem }));
  if (linhas.length > 0) {
    const { error: e2 } = await supabase.from("onboarding_processo_item").insert(linhas);
    if (e2) return { erro: "Falha ao materializar itens." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function salvarProcessoItem(input: { id?: string; processoId: string; clienteId: string; blocoOrdem: number; blocoNome: string; codigo: string | null; titulo: string; tipo: "padrao" | "acesso"; responsavelPapel: string | null; responsavelId: string | null; prazo: string | null; status: StatusItem; observacao: string | null; bloqueante: boolean; acessoUrl: string | null; acessoLogin: string | null; novaSenha?: string | null; ordem: number }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row: Record<string, unknown> = { processo_id: input.processoId, bloco_ordem: input.blocoOrdem, bloco_nome: input.blocoNome, codigo: input.codigo, titulo: input.titulo, tipo: input.tipo, responsavel_papel: input.responsavelPapel, responsavel_id: input.responsavelId, prazo: input.prazo || null, status: input.status, observacao: input.observacao, bloqueante: input.bloqueante, acesso_url: input.acessoUrl, acesso_login: input.acessoLogin, ordem: input.ordem, atualizado_em: new Date().toISOString(), atualizado_por: p.id };
  if (input.novaSenha) {
    try { row.acesso_senha_cifrada = cifrarSenha(input.novaSenha); } catch { return { erro: "Cofre não configurado (ONBOARDING_CRIPTO_KEY)." }; }
  }
  const { error } = input.id ? await supabase.from("onboarding_processo_item").update(row).eq("id", input.id) : await supabase.from("onboarding_processo_item").insert(row);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${input.clienteId}`);
  return { ok: true };
}

export async function removerProcessoItem(id: string, clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_processo_item").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function revelarSenha(itemId: string): Promise<{ senha?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeRevelarCredencial(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_processo_item").select("acesso_senha_cifrada").eq("id", itemId).maybeSingle();
  if (!data?.acesso_senha_cifrada) return { erro: "Sem senha cadastrada." };
  let senha: string;
  try { senha = decifrarSenha(data.acesso_senha_cifrada as string); } catch { return { erro: "Falha ao decifrar (chave?)." }; }
  const { error: logErr } = await supabase.from("onboarding_log_credencial").insert({ item_id: itemId, usuario_id: p.id });
  if (logErr) return { erro: "Não foi possível registrar a auditoria; revelação cancelada." };
  return { senha };
}
