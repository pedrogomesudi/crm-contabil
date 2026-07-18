"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { type Etapa } from "@/lib/comercial/funil";
import { corValida, rotuloValido, proximaOrdem, pctParaProb } from "@/lib/comercial/funilConfig";

type Resp = { ok?: boolean; erro?: string };
const COR_PADRAO = "#5A6163";

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}
function revalidar() {
  revalidatePath("/configuracoes/funil");
  revalidatePath("/comercial");
}

export async function listarEtapasConfig(): Promise<Etapa[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("funil_etapa")
    .select("id, rotulo, ordem, cor, probabilidade")
    .eq("arquivada", false)
    .order("ordem");
  return (data ?? []).map((e) => ({
    id: e.id as string,
    rotulo: e.rotulo as string,
    ordem: e.ordem as number,
    cor: e.cor as string,
    probabilidade: Number(e.probabilidade),
  }));
}

export async function criarEtapa(rotulo: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!rotuloValido(rotulo)) return { erro: "Informe um rótulo (até 40 caracteres)." };
  const etapas = await listarEtapasConfig();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("funil_etapa").insert({
    rotulo: rotulo.trim(),
    ordem: proximaOrdem(etapas),
    cor: COR_PADRAO,
    probabilidade: 0.5,
  });
  if (error) return { erro: "Falha ao criar a etapa." };
  revalidar();
  return { ok: true };
}

export async function renomearEtapa(id: string, rotulo: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!rotuloValido(rotulo)) return { erro: "Informe um rótulo (até 40 caracteres)." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("funil_etapa").update({ rotulo: rotulo.trim() }).eq("id", id);
  if (error) return { erro: "Falha ao renomear." };
  revalidar();
  return { ok: true };
}

export async function recolorirEtapa(id: string, cor: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!corValida(cor)) return { erro: "Cor inválida (use #RRGGBB)." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("funil_etapa").update({ cor }).eq("id", id);
  if (error) return { erro: "Falha ao salvar a cor." };
  revalidar();
  return { ok: true };
}

export async function definirProbabilidade(id: string, pct: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { erro: "Probabilidade de 0 a 100%." };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("funil_etapa")
    .update({ probabilidade: pctParaProb(pct) })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar a probabilidade." };
  revalidar();
  return { ok: true };
}

export async function reordenarEtapas(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("funil_etapa")
      .update({ ordem: i + 1 })
      .eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}

export async function arquivarEtapa(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("oportunidade")
    .select("id", { count: "exact", head: true })
    .eq("etapa_id", id)
    .is("desfecho", null);
  if ((count ?? 0) > 0) {
    return { erro: `Mova os ${count} negócio(s) desta etapa antes de arquivá-la.` };
  }
  const { error } = await supabase.from("funil_etapa").update({ arquivada: true }).eq("id", id);
  if (error) return { erro: "Falha ao arquivar." };
  revalidar();
  return { ok: true };
}
