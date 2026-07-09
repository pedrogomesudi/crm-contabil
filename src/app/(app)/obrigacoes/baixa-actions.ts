"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";

const MAX_ANEXO = 10 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/png", "image/jpeg"];
const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

async function instanciaComContexto(supabase: Awaited<ReturnType<typeof createServerSupabase>>, id: string) {
  const { data } = await supabase.from("obrigacao_instancia").select("id, cliente_id, comprovante_path, entregue_em, status, obrigacao(comprovante_obrigatorio)").eq("id", id).maybeSingle();
  return data;
}

export async function darBaixa(instanciaId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const inst = await instanciaComContexto(supabase, instanciaId);
  if (!inst) return { erro: "Instância não encontrada ou sem permissão." };
  const obr = (Array.isArray(inst.obrigacao) ? inst.obrigacao[0] : inst.obrigacao) as { comprovante_obrigatorio?: boolean } | null;
  const file = formData.get("comprovante");
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  const data = String(formData.get("data") ?? "") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const temArquivo = file instanceof File && file.size > 0;

  if (obr?.comprovante_obrigatorio && !temArquivo) return { erro: "Comprovante obrigatório para esta obrigação." };
  let comprovantePath: string | null = (inst.comprovante_path as string | null) ?? null;
  const admin = createAdminSupabase();
  if (temArquivo) {
    const f = file as File;
    if (f.size > MAX_ANEXO) return { erro: "Arquivo acima de 10 MB." };
    if (!TIPOS.includes(f.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };
    const caminho = `obrigacoes/${inst.cliente_id}/${instanciaId}/${crypto.randomUUID()}-${nomeSeguro(f.name)}`;
    const up = await admin.storage.from("documentos").upload(caminho, f, { contentType: f.type });
    if (up.error) return { erro: "Falha no upload." };
    comprovantePath = caminho;
  }
  const { error } = await admin.from("obrigacao_instancia").update({ status: "pendente", entregue_em: data, entregue_por: perfil.id, observacao, comprovante_path: comprovantePath }).eq("id", instanciaId);
  if (error) {
    if (temArquivo && comprovantePath) await admin.storage.from("documentos").remove([comprovantePath]);
    return { erro: "Falha ao registrar a baixa." };
  }
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function reabrir(instanciaId: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const inst = await instanciaComContexto(supabase, instanciaId);
  if (!inst) return { erro: "Instância não encontrada." };
  const admin = createAdminSupabase();
  if (inst.comprovante_path) await admin.storage.from("documentos").remove([inst.comprovante_path as string]);
  const { error } = await admin.from("obrigacao_instancia").update({ status: "pendente", entregue_em: null, entregue_por: null, observacao: null, comprovante_path: null }).eq("id", instanciaId);
  if (error) return { erro: "Falha ao reabrir." };
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function alternarDispensa(instanciaId: string, dispensar: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const inst = await instanciaComContexto(supabase, instanciaId);
  if (!inst) return { erro: "Instância não encontrada." };
  if (dispensar && inst.entregue_em) return { erro: "Já entregue; reabra antes de dispensar." };
  const { error } = await supabase.from("obrigacao_instancia").update({ status: dispensar ? "dispensada" : "pendente" }).eq("id", instanciaId);
  if (error) return { erro: "Falha ao atualizar." };
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function urlComprovante(instanciaId: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_instancia").select("comprovante_path").eq("id", instanciaId).maybeSingle();
  if (!data?.comprovante_path) return { erro: "Sem comprovante." };
  const admin = createAdminSupabase();
  const { data: signed, error } = await admin.storage.from("documentos").createSignedUrl(data.comprovante_path as string, 60);
  if (error || !signed?.signedUrl) return { erro: "Não foi possível gerar o link." };
  return { url: signed.signedUrl };
}
