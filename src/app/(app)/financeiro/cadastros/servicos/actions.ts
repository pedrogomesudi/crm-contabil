"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import type { EstadoCrud } from "@/components/financeiro/CadastroCrud";

const ROTA = "/financeiro/cadastros/servicos";

async function exigirGestor() {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  return perfil;
}

export async function salvarServico(_prev: EstadoCrud, fd: FormData): Promise<EstadoCrud> {
  const perfil = await exigirGestor();
  if (!perfil) return { erro: "Sem permissão." };
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) return { erro: "Nome é obrigatório." };
  const precoRaw = String(fd.get("preco_sugerido") ?? "").trim();
  const id = String(fd.get("id") ?? "").trim();
  const registro = {
    nome,
    descricao: String(fd.get("descricao") ?? "").trim() || null,
    preco_sugerido: precoRaw ? Number(precoRaw) : null,
    categoria_id: String(fd.get("categoria_id") ?? "").trim() || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };
  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("servico").update(registro).eq("id", id)
    : await supabase.from("servico").insert({ ...registro, criado_por: perfil.id });
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function alternarAtivaServico(fd: FormData): Promise<void> {
  const perfil = await exigirGestor();
  if (!perfil) return;
  const id = String(fd.get("id") ?? "");
  const ativa = String(fd.get("ativa") ?? "") === "true";
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase
    .from("servico")
    .update({ ativa, atualizado_em: new Date().toISOString(), atualizado_por: perfil.id })
    .eq("id", id);
  revalidatePath(ROTA);
}
