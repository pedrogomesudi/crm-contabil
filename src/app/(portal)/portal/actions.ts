"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ehCliente } from "@/lib/portal/permissoes";

// PADRÃO DE SEGURANÇA (obrigatório em todo download do portal):
// 1) lê o registro com o cliente Supabase DO USUÁRIO — a RLS prova a titularidade;
// 2) só então assina a URL com service_role.
// Nunca assinar um caminho vindo do navegador sem passar pela RLS.
async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !ehCliente(p.papel)) return null;
  return p;
}

async function assinar(caminho: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from("documentos").createSignedUrl(caminho, 60);
  return data?.signedUrl ?? null;
}

export async function urlDocumento(id: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("documentos").select("caminho_storage").eq("id", id).maybeSingle();
  if (!data?.caminho_storage) return { erro: "Documento não encontrado." };
  const url = await assinar(data.caminho_storage as string);
  return url ? { url } : { erro: "Falha ao gerar o link." };
}

export async function urlDanfse(id: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("nfse").select("danfse_path").eq("id", id).maybeSingle();
  if (!data?.danfse_path) return { erro: "DANFSe não disponível." };
  const url = await assinar(data.danfse_path as string);
  return url ? { url } : { erro: "Falha ao gerar o link." };
}

export async function urlComprovanteObrigacao(id: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_instancia").select("comprovante_path").eq("id", id).maybeSingle();
  if (!data?.comprovante_path) return { erro: "Comprovante não disponível." };
  const url = await assinar(data.comprovante_path as string);
  return url ? { url } : { erro: "Falha ao gerar o link." };
}
