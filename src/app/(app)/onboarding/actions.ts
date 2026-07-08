"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeGerenciarModeloOnboarding } from "@/lib/clientes/permissoes";
import { progressoOnboarding, proximoPrazo, type CategoriaOnb, type ItemOnb } from "@/lib/onboarding/progresso";

export type ItemModelo = { id: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; ativo: boolean };

export async function listarModelo(): Promise<ItemModelo[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_item_modelo").select("id, categoria, nome, obrigatorio, ordem, ativo").order("ordem");
  return (data ?? []) as ItemModelo[];
}

export async function salvarModeloItem(input: { id?: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; ativo: boolean }): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row = { categoria: input.categoria, nome: input.nome, obrigatorio: input.obrigatorio, ordem: input.ordem, ativo: input.ativo };
  const { error } = input.id
    ? await supabase.from("onboarding_item_modelo").update(row).eq("id", input.id)
    : await supabase.from("onboarding_item_modelo").insert(row);
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}

export async function removerModeloItem(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarModeloOnboarding(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_item_modelo").delete().eq("id", id);
  return error ? { erro: "Falha ao remover." } : { ok: true };
}

export type OnboardingResumo = { clienteId: string; razaoSocial: string; total: number; concluidos: number; pct: number; concluido: boolean; proximoPrazo: string | null };

export async function listarOnboardings(): Promise<OnboardingResumo[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_item").select("cliente_id, categoria, nome, obrigatorio, ordem, status, prazo, clientes(razao_social)");
  const porCliente = new Map<string, { razao: string; itens: ItemOnb[] }>();
  for (const r of data ?? []) {
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes;
    const e = porCliente.get(r.cliente_id as string) ?? { razao: (cli?.razao_social as string) ?? "—", itens: [] };
    e.itens.push({ id: "", categoria: r.categoria as CategoriaOnb, nome: r.nome as string, obrigatorio: r.obrigatorio as boolean, ordem: r.ordem as number, status: r.status as ItemOnb["status"], prazo: r.prazo as string | null });
    porCliente.set(r.cliente_id as string, e);
  }
  const out: OnboardingResumo[] = [];
  for (const [clienteId, { razao, itens }] of porCliente) {
    const prog = progressoOnboarding(itens);
    out.push({ clienteId, razaoSocial: razao, total: prog.total, concluidos: prog.concluidos, pct: prog.pct, concluido: prog.concluido, proximoPrazo: proximoPrazo(itens) });
  }
  return out.sort((a, b) => a.pct - b.pct);
}
