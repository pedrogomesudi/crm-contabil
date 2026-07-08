"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeGerenciarModeloOnboarding } from "@/lib/clientes/permissoes";
import { TEMPLATE_PADRAO } from "@/lib/onboarding/template-seed";
import { slugify, alvoTroca } from "@/lib/onboarding/template-util";

export type ItemTemplateView = { id: string; blocoId: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number; dependeDe: string[]; campoDestino: string | null };
export type BlocoView = { id: string; ordem: number; nome: string; prazoBlocoDias: number | null; itens: ItemTemplateView[] };
export type TemplateView = { id: string; slug: string; nome: string; descricao: string | null; ativo: boolean; blocos: BlocoView[] } | null;

async function carregarBlocos(supabase: Awaited<ReturnType<typeof createServerSupabase>>, tpl: { id: string; slug: string; nome: string; descricao: string | null; ativo: boolean }): Promise<NonNullable<TemplateView>> {
  const { data: blocos } = await supabase.from("onboarding_bloco").select("id, ordem, nome, prazo_bloco_dias").eq("template_id", tpl.id).order("ordem");
  const { data: itens } = await supabase.from("onboarding_template_item").select("id, bloco_id, codigo, titulo, descricao, tipo, responsavel_papel, prazo_dias, aplicavel_a, condicao_flags, condicao_modo, bloqueante, anexo_obrigatorio, alerta_risco, ordem, depende_de, campo_destino").in("bloco_id", (blocos ?? []).map((b) => b.id as string)).order("ordem");
  const porBloco = (bid: string): ItemTemplateView[] =>
    (itens ?? [])
      .filter((i) => i.bloco_id === bid)
      .map((i) => ({ id: i.id as string, blocoId: i.bloco_id as string, codigo: i.codigo as string, titulo: i.titulo as string, descricao: i.descricao as string | null, tipo: i.tipo as "padrao" | "acesso", responsavelPapel: i.responsavel_papel as string | null, prazoDias: i.prazo_dias as number | null, aplicavelA: (i.aplicavel_a as string[]) ?? [], condicaoFlags: (i.condicao_flags as string[]) ?? [], condicaoModo: i.condicao_modo as "any" | "all", bloqueante: i.bloqueante as boolean, anexoObrigatorio: i.anexo_obrigatorio as boolean, alertaRisco: i.alerta_risco as string | null, ordem: i.ordem as number, dependeDe: (i.depende_de as string[]) ?? [], campoDestino: i.campo_destino as string | null }));
  return { id: tpl.id, slug: tpl.slug, nome: tpl.nome, descricao: tpl.descricao, ativo: tpl.ativo, blocos: (blocos ?? []).map((b) => ({ id: b.id as string, ordem: b.ordem as number, nome: b.nome as string, prazoBlocoDias: b.prazo_bloco_dias as number | null, itens: porBloco(b.id as string) })) };
}

export async function obterTemplate(templateId: string): Promise<TemplateView> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase.from("onboarding_template").select("id, slug, nome, descricao, ativo").eq("id", templateId).maybeSingle();
  if (!tpl) return null;
  return carregarBlocos(supabase, tpl as { id: string; slug: string; nome: string; descricao: string | null; ativo: boolean });
}

export type TemplateResumo = { id: string; nome: string; descricao: string | null; ativo: boolean; blocos: number; itens: number; processos: number };

export async function listarTemplates(): Promise<TemplateResumo[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data: tpls } = await supabase.from("onboarding_template").select("id, nome, descricao, ativo").order("nome");
  if (!tpls || tpls.length === 0) return [];
  const ids = tpls.map((t) => t.id as string);
  const { data: blocos } = await supabase.from("onboarding_bloco").select("id, template_id").in("template_id", ids);
  const blocoIds = (blocos ?? []).map((b) => b.id as string);
  const { data: itens } = blocoIds.length ? await supabase.from("onboarding_template_item").select("bloco_id").in("bloco_id", blocoIds) : { data: [] as { bloco_id: string }[] };
  const { data: procs } = await supabase.from("onboarding_processo").select("template_id").in("template_id", ids);
  const blocoDoItem = new Map((blocos ?? []).map((b) => [b.id as string, b.template_id as string]));
  const nBlocos = new Map<string, number>();
  for (const b of blocos ?? []) nBlocos.set(b.template_id as string, (nBlocos.get(b.template_id as string) ?? 0) + 1);
  const nItens = new Map<string, number>();
  for (const i of itens ?? []) {
    const t = blocoDoItem.get(i.bloco_id as string);
    if (t) nItens.set(t, (nItens.get(t) ?? 0) + 1);
  }
  const nProcs = new Map<string, number>();
  for (const pr of procs ?? []) nProcs.set(pr.template_id as string, (nProcs.get(pr.template_id as string) ?? 0) + 1);
  return tpls.map((t) => ({ id: t.id as string, nome: t.nome as string, descricao: t.descricao as string | null, ativo: t.ativo as boolean, blocos: nBlocos.get(t.id as string) ?? 0, itens: nItens.get(t.id as string) ?? 0, processos: nProcs.get(t.id as string) ?? 0 }));
}

export async function listarTemplatesAtivos(): Promise<{ id: string; nome: string }[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_template").select("id, nome").eq("ativo", true).order("nome");
  return (data ?? []).map((t) => ({ id: t.id as string, nome: t.nome as string }));
}

export async function criarTemplate(nome: string, descricao: string | null): Promise<{ id?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  if (!nome.trim()) return { erro: "Informe o nome." };
  const supabase = await createServerSupabase();
  const base = slugify(nome) || "template";
  const { data: existentes } = await supabase.from("onboarding_template").select("slug");
  const usados = new Set((existentes ?? []).map((t) => t.slug as string));
  let slug = base;
  let n = 2;
  while (usados.has(slug)) slug = `${base}-${n++}`;
  const { data, error } = await supabase.from("onboarding_template").insert({ slug, nome: nome.trim(), descricao }).select("id").single();
  if (error || !data) return { erro: "Falha ao criar." };
  return { id: data.id as string };
}

export async function salvarTemplate(id: string, nome: string, descricao: string | null, ativo: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_template").update({ nome: nome.trim(), descricao, ativo }).eq("id", id);
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}

export async function excluirTemplate(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("onboarding_processo").select("id", { count: "exact", head: true }).eq("template_id", id);
  if ((count ?? 0) > 0) return { erro: "Há processos usando este template; desative-o em vez de excluir." };
  const { error } = await supabase.from("onboarding_template").delete().eq("id", id);
  return error ? { erro: "Falha ao excluir." } : { ok: true };
}

export async function semearTemplatePadrao(): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: existe } = await supabase.from("onboarding_template").select("id").eq("slug", TEMPLATE_PADRAO.slug).maybeSingle();
  if (existe) return { ok: true };
  const { data: tpl, error: e1 } = await supabase.from("onboarding_template").insert({ slug: TEMPLATE_PADRAO.slug, nome: TEMPLATE_PADRAO.nome, descricao: TEMPLATE_PADRAO.descricao }).select("id").single();
  if (e1 || !tpl) return { erro: "Falha ao criar template." };
  for (const b of TEMPLATE_PADRAO.blocos) {
    const { data: bloco, error: e2 } = await supabase.from("onboarding_bloco").insert({ template_id: tpl.id, ordem: b.ordem, slug: `bloco-${b.ordem}`, nome: b.nome, prazo_bloco_dias: b.prazoBlocoDias }).select("id").single();
    if (e2 || !bloco) return { erro: "Falha ao criar bloco." };
    const linhas = b.itens.map((i) => ({ bloco_id: bloco.id, codigo: i.codigo, titulo: i.titulo, descricao: i.descricao, tipo: i.tipo, responsavel_papel: i.responsavelPapel, prazo_dias: i.prazoDias, aplicavel_a: i.aplicavelA, condicao_flags: i.condicaoFlags, condicao_modo: i.condicaoModo, bloqueante: i.bloqueante, anexo_obrigatorio: i.anexoObrigatorio, alerta_risco: i.alertaRisco, ordem: i.ordem, depende_de: i.dependeDe, campo_destino: i.campoDestino }));
    const { error: e3 } = await supabase.from("onboarding_template_item").insert(linhas);
    if (e3) return { erro: "Falha ao criar itens." };
  }
  return { ok: true };
}

export async function salvarTemplateItem(input: { id?: string; blocoId: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number; dependeDe: string[]; campoDestino: string | null }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row = { bloco_id: input.blocoId, codigo: input.codigo, titulo: input.titulo, descricao: input.descricao, tipo: input.tipo, responsavel_papel: input.responsavelPapel, prazo_dias: input.prazoDias, aplicavel_a: input.aplicavelA, condicao_flags: input.condicaoFlags, condicao_modo: input.condicaoModo, bloqueante: input.bloqueante, anexo_obrigatorio: input.anexoObrigatorio, alerta_risco: input.alertaRisco, ordem: input.ordem, depende_de: input.dependeDe, campo_destino: input.campoDestino };
  const { error } = input.id ? await supabase.from("onboarding_template_item").update(row).eq("id", input.id) : await supabase.from("onboarding_template_item").insert(row);
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}

export async function removerTemplateItem(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_template_item").delete().eq("id", id);
  return error ? { erro: "Falha ao remover." } : { ok: true };
}

export async function criarBloco(templateId: string, nome: string, prazoBlocoDias: number | null): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  if (!nome.trim()) return { erro: "Informe o nome do bloco." };
  const supabase = await createServerSupabase();
  const { data: existentes } = await supabase.from("onboarding_bloco").select("ordem").eq("template_id", templateId);
  const ordem = Math.max(0, ...(existentes ?? []).map((b) => b.ordem as number)) + 1;
  const { error } = await supabase.from("onboarding_bloco").insert({ template_id: templateId, nome: nome.trim(), prazo_bloco_dias: prazoBlocoDias, ordem, slug: `bloco-${ordem}` });
  return error ? { erro: "Falha ao criar bloco." } : { ok: true };
}

export async function salvarBloco(id: string, nome: string, prazoBlocoDias: number | null, ordem: number): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_bloco").update({ nome: nome.trim(), prazo_bloco_dias: prazoBlocoDias, ordem }).eq("id", id);
  return error ? { erro: "Falha ao salvar bloco." } : { ok: true };
}

export async function removerBloco(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_bloco").delete().eq("id", id);
  return error ? { erro: "Falha ao remover bloco." } : { ok: true };
}

async function trocarOrdem(tabela: "onboarding_bloco" | "onboarding_template_item", aId: string, bId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from(tabela).select("id, ordem").in("id", [aId, bId]);
  const a = (data ?? []).find((r) => r.id === aId);
  const b = (data ?? []).find((r) => r.id === bId);
  if (!a || !b) return;
  await supabase.from(tabela).update({ ordem: b.ordem }).eq("id", aId);
  await supabase.from(tabela).update({ ordem: a.ordem }).eq("id", bId);
}

export async function moverBloco(id: string, direcao: "cima" | "baixo"): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: bloco } = await supabase.from("onboarding_bloco").select("template_id").eq("id", id).maybeSingle();
  if (!bloco) return { erro: "Bloco não encontrado." };
  const { data: irmaos } = await supabase.from("onboarding_bloco").select("id, ordem").eq("template_id", bloco.template_id as string);
  const alvo = alvoTroca((irmaos ?? []).map((b) => ({ id: b.id as string, ordem: b.ordem as number })), id, direcao);
  if (alvo) await trocarOrdem("onboarding_bloco", id, alvo);
  return { ok: true };
}

export async function moverItem(id: string, direcao: "cima" | "baixo"): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: item } = await supabase.from("onboarding_template_item").select("bloco_id").eq("id", id).maybeSingle();
  if (!item) return { erro: "Item não encontrado." };
  const { data: irmaos } = await supabase.from("onboarding_template_item").select("id, ordem").eq("bloco_id", item.bloco_id as string);
  const alvo = alvoTroca((irmaos ?? []).map((i) => ({ id: i.id as string, ordem: i.ordem as number })), id, direcao);
  if (alvo) await trocarOrdem("onboarding_template_item", id, alvo);
  return { ok: true };
}
