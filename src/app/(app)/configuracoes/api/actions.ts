"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { gerarChave } from "@/lib/api/chave";
import { ESCOPOS_API } from "@/lib/api/escopos";

export type ApiKeyView = {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  ultimoUso: string | null;
  revogadaEm: string | null;
};

async function admOk(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return !!perfil?.ativo && perfil.papel === "admin";
}

export async function listarApiKeys(): Promise<ApiKeyView[]> {
  if (!(await admOk())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("api_key")
    .select("id, nome, prefixo, escopos, ultimo_uso, revogada_em")
    .order("criado_em", { ascending: false });
  return (data ?? []).map((k) => ({
    id: k.id as string,
    nome: k.nome as string,
    prefixo: k.prefixo as string,
    escopos: (k.escopos as string[] | null) ?? [],
    ultimoUso: (k.ultimo_uso as string | null) ?? null,
    revogadaEm: (k.revogada_em as string | null) ?? null,
  }));
}

export async function criarApiKey(nome: string, escopos: string[]): Promise<{ chave?: string; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const nomeLimpo = nome.trim().slice(0, 80);
  if (!nomeLimpo) return { erro: "Dê um nome à chave." };
  const validos = escopos.filter((e) => (ESCOPOS_API as readonly string[]).includes(e));
  if (validos.length === 0) return { erro: "Selecione ao menos um escopo." };
  const { chave, hash, prefixo } = gerarChave();
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("api_key")
    .insert({ nome: nomeLimpo, key_hash: hash, prefixo, escopos: validos, criado_por: perfil.id });
  if (error) return { erro: "Falha ao criar a chave." };
  revalidatePath("/configuracoes/api");
  return { chave }; // devolvida UMA vez
}

export async function revogarApiKey(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin.from("api_key").update({ revogada_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Falha ao revogar." };
  revalidatePath("/configuracoes/api");
  return { ok: true };
}
