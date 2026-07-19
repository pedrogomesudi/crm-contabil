"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { moverNaOrdem } from "@/lib/comercial/funilConfig";
import type { CampoDef, CampoTipo } from "@/lib/clientes/campos-custom";

export type CampoRow = CampoDef & { ordem: number; ativo: boolean };

const TIPOS: CampoTipo[] = ["texto", "numero", "data", "booleano", "lista"];
const rev = () => revalidatePath("/configuracoes/campos-custom");

function mapRow(r: Record<string, unknown>): CampoRow {
  return {
    id: r.id as string,
    nome: r.nome as string,
    tipo: r.tipo as CampoTipo,
    obrigatorio: r.obrigatorio as boolean,
    opcoes: (r.opcoes as string[] | null) ?? [],
    ordem: r.ordem as number,
    ativo: r.ativo as boolean,
  };
}

export async function listarCamposCustom(): Promise<CampoRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("campo_custom")
    .select("id, nome, tipo, obrigatorio, opcoes, ordem, ativo")
    .order("ordem");
  return (data ?? []).map(mapRow);
}

export async function carregarCamposAtivos(): Promise<CampoDef[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("campo_custom")
    .select("id, nome, tipo, obrigatorio, opcoes")
    .eq("ativo", true)
    .order("ordem");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    tipo: r.tipo as CampoTipo,
    obrigatorio: r.obrigatorio as boolean,
    opcoes: (r.opcoes as string[] | null) ?? [],
  }));
}

export async function criarCampo(fd: FormData): Promise<{ erro?: string }> {
  const nome = String(fd.get("nome") ?? "").trim();
  const tipo = String(fd.get("tipo") ?? "") as CampoTipo;
  const obrigatorio = fd.get("obrigatorio") != null;
  if (!nome) return { erro: "Informe o nome do campo." };
  if (!TIPOS.includes(tipo)) return { erro: "Tipo inválido." };
  const opcoes =
    tipo === "lista"
      ? String(fd.get("opcoes") ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : null;
  if (tipo === "lista" && (!opcoes || opcoes.length === 0)) return { erro: "Uma lista precisa de opções." };

  const supabase = await createServerSupabase();
  const { data: max } = await supabase
    .from("campo_custom")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = ((max?.ordem as number | undefined) ?? -1) + 1;
  const { error } = await supabase.from("campo_custom").insert({ nome, tipo, obrigatorio, opcoes, ordem });
  if (error) return { erro: "Não foi possível criar o campo (sem permissão?)." };
  rev();
  return {};
}

export async function moverCampo(id: string, dir: "cima" | "baixo"): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("campo_custom").select("id").order("ordem");
  const ids = (data ?? []).map((r) => r.id as string);
  const nova = moverNaOrdem(ids, id, dir);
  await Promise.all(nova.map((cid, i) => supabase.from("campo_custom").update({ ordem: i }).eq("id", cid)));
  rev();
  return {};
}

export async function alternarAtivo(id: string, ativo: boolean): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campo_custom").update({ ativo }).eq("id", id);
  if (error) return { erro: "Não foi possível alterar o campo (sem permissão?)." };
  rev();
  return {};
}

export async function removerCampo(id: string): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campo_custom").delete().eq("id", id);
  if (error) return { erro: "Não foi possível remover o campo (sem permissão?)." };
  rev();
  return {};
}
