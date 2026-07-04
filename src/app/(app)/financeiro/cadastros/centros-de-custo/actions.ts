"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import type { EstadoCrud } from "@/components/financeiro/CadastroCrud";

const ROTA = "/financeiro/cadastros/centros-de-custo";

async function exigirGestor() {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  return perfil;
}

export async function salvarCentro(_prev: EstadoCrud, fd: FormData): Promise<EstadoCrud> {
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Sem permissão." };
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) return { erro: "Nome é obrigatório." };
  const id = String(fd.get("id") ?? "").trim();
  const registro = { nome, atualizado_em: new Date().toISOString(), atualizado_por: perfil.id };
  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("centro_custo").update(registro).eq("id", id)
    : await supabase.from("centro_custo").insert({ ...registro, criado_por: perfil.id });
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function alternarAtivaCentro(fd: FormData): Promise<void> {
  const perfil = await exigirGestor();
  if (!perfil) return;
  const id = String(fd.get("id") ?? "");
  const ativa = String(fd.get("ativa") ?? "") === "true";
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase
    .from("centro_custo")
    .update({ ativa, atualizado_em: new Date().toISOString(), atualizado_por: perfil.id })
    .eq("id", id);
  revalidatePath(ROTA);
}
