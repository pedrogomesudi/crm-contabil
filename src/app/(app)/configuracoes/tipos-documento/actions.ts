"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { moverNaOrdem } from "@/lib/comercial/funilConfig";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";

export type TipoDocRow = { id: string; nome: string; departamento: string | null; ordem: number; ativo: boolean };

const rev = () => revalidatePath("/configuracoes/tipos-documento");
const DEPS = DEPARTAMENTOS.map((d) => d.valor as string);

export async function listarTiposDocumento(): Promise<TipoDocRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("tipo_documento").select("id, nome, departamento, ordem, ativo").order("ordem");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    departamento: (r.departamento as string | null) ?? null,
    ordem: r.ordem as number,
    ativo: r.ativo as boolean,
  }));
}

export async function carregarTiposAtivos(): Promise<{ id: string; nome: string; departamento: string | null }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tipo_documento")
    .select("id, nome, departamento")
    .eq("ativo", true)
    .order("ordem");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    departamento: (r.departamento as string | null) ?? null,
  }));
}

export async function criarTipoDoc(fd: FormData): Promise<{ erro?: string }> {
  const nome = String(fd.get("nome") ?? "").trim();
  const depRaw = String(fd.get("departamento") ?? "").trim();
  const departamento = depRaw && DEPS.includes(depRaw) ? depRaw : null;
  if (!nome) return { erro: "Informe o nome do tipo." };
  const supabase = await createServerSupabase();
  const { data: max } = await supabase
    .from("tipo_documento")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = ((max?.ordem as number | undefined) ?? -1) + 1;
  const { error } = await supabase.from("tipo_documento").insert({ nome, departamento, ordem });
  if (error) return { erro: "Não foi possível criar o tipo (sem permissão?)." };
  rev();
  return {};
}

export async function moverTipoDoc(id: string, dir: "cima" | "baixo"): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("tipo_documento").select("id").order("ordem");
  const ids = (data ?? []).map((r) => r.id as string);
  const nova = moverNaOrdem(ids, id, dir);
  await Promise.all(nova.map((cid, i) => supabase.from("tipo_documento").update({ ordem: i }).eq("id", cid)));
  rev();
  return {};
}

export async function alternarAtivoTipoDoc(id: string, ativo: boolean): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tipo_documento").update({ ativo }).eq("id", id);
  if (error) return { erro: "Não foi possível alterar o tipo (sem permissão?)." };
  rev();
  return {};
}

export async function removerTipoDoc(id: string): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tipo_documento").delete().eq("id", id);
  if (error) return { erro: "Não foi possível remover o tipo (sem permissão?)." };
  rev();
  return {};
}
