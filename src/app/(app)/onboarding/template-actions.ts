"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeGerenciarModeloOnboarding } from "@/lib/clientes/permissoes";
import { TEMPLATE_PADRAO } from "@/lib/onboarding/template-seed";

export type ItemTemplateView = { id: string; blocoId: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number };
export type BlocoView = { id: string; ordem: number; nome: string; prazoBlocoDias: number | null; itens: ItemTemplateView[] };
export type TemplateView = { id: string; slug: string; nome: string; blocos: BlocoView[] } | null;

export async function listarTemplate(): Promise<TemplateView> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase.from("onboarding_template").select("id, slug, nome").eq("ativo", true).order("criado_em").limit(1).maybeSingle();
  if (!tpl) return null;
  const { data: blocos } = await supabase.from("onboarding_bloco").select("id, ordem, nome, prazo_bloco_dias").eq("template_id", tpl.id).order("ordem");
  const { data: itens } = await supabase.from("onboarding_template_item").select("id, bloco_id, codigo, titulo, descricao, tipo, responsavel_papel, prazo_dias, aplicavel_a, condicao_flags, condicao_modo, bloqueante, anexo_obrigatorio, alerta_risco, ordem").in("bloco_id", (blocos ?? []).map((b) => b.id as string)).order("ordem");
  const porBloco = (bid: string): ItemTemplateView[] =>
    (itens ?? [])
      .filter((i) => i.bloco_id === bid)
      .map((i) => ({ id: i.id as string, blocoId: i.bloco_id as string, codigo: i.codigo as string, titulo: i.titulo as string, descricao: i.descricao as string | null, tipo: i.tipo as "padrao" | "acesso", responsavelPapel: i.responsavel_papel as string | null, prazoDias: i.prazo_dias as number | null, aplicavelA: (i.aplicavel_a as string[]) ?? [], condicaoFlags: (i.condicao_flags as string[]) ?? [], condicaoModo: i.condicao_modo as "any" | "all", bloqueante: i.bloqueante as boolean, anexoObrigatorio: i.anexo_obrigatorio as boolean, alertaRisco: i.alerta_risco as string | null, ordem: i.ordem as number }));
  return { id: tpl.id as string, slug: tpl.slug as string, nome: tpl.nome as string, blocos: (blocos ?? []).map((b) => ({ id: b.id as string, ordem: b.ordem as number, nome: b.nome as string, prazoBlocoDias: b.prazo_bloco_dias as number | null, itens: porBloco(b.id as string) })) };
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
    const linhas = b.itens.map((i) => ({ bloco_id: bloco.id, codigo: i.codigo, titulo: i.titulo, descricao: i.descricao, tipo: i.tipo, responsavel_papel: i.responsavelPapel, prazo_dias: i.prazoDias, aplicavel_a: i.aplicavelA, condicao_flags: i.condicaoFlags, condicao_modo: i.condicaoModo, bloqueante: i.bloqueante, anexo_obrigatorio: i.anexoObrigatorio, alerta_risco: i.alertaRisco, ordem: i.ordem }));
    const { error: e3 } = await supabase.from("onboarding_template_item").insert(linhas);
    if (e3) return { erro: "Falha ao criar itens." };
  }
  return { ok: true };
}

export async function salvarTemplateItem(input: { id?: string; blocoId: string; codigo: string; titulo: string; descricao: string | null; tipo: "padrao" | "acesso"; responsavelPapel: string | null; prazoDias: number | null; aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all"; bloqueante: boolean; anexoObrigatorio: boolean; alertaRisco: string | null; ordem: number }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row = { bloco_id: input.blocoId, codigo: input.codigo, titulo: input.titulo, descricao: input.descricao, tipo: input.tipo, responsavel_papel: input.responsavelPapel, prazo_dias: input.prazoDias, aplicavel_a: input.aplicavelA, condicao_flags: input.condicaoFlags, condicao_modo: input.condicaoModo, bloqueante: input.bloqueante, anexo_obrigatorio: input.anexoObrigatorio, alerta_risco: input.alertaRisco, ordem: input.ordem };
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
