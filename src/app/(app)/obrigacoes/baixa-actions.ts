"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { darBaixaObrigacaoNucleo } from "@/lib/obrigacoes/gravar-baixa";

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

async function instanciaComContexto(supabase: Awaited<ReturnType<typeof createServerSupabase>>, id: string) {
  const { data } = await supabase
    .from("obrigacao_instancia")
    .select("id, cliente_id, comprovante_path, entregue_em, status, obrigacao(comprovante_obrigatorio)")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function darBaixa(instanciaId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const file = formData.get("comprovante");
  const comprovante =
    file instanceof File && file.size > 0
      ? { bytes: new Uint8Array(await file.arrayBuffer()), nome: file.name, mime: file.type }
      : null;
  const r = await darBaixaObrigacaoNucleo(
    {
      instanciaId,
      data: String(formData.get("data") ?? "") || undefined,
      observacao: String(formData.get("observacao") ?? "").trim() || null,
      comprovante,
    },
    { admin: createAdminSupabase(), autorId: perfil.id },
  );
  if (!r.ok) return { erro: r.erro };
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${r.clienteId}`);
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
  const { error } = await admin
    .from("obrigacao_instancia")
    .update({ status: "pendente", entregue_em: null, entregue_por: null, observacao: null, comprovante_path: null })
    .eq("id", instanciaId);
  if (error) return { erro: "Falha ao reabrir." };
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function alternarDispensa(
  instanciaId: string,
  dispensar: boolean,
): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const inst = await instanciaComContexto(supabase, instanciaId);
  if (!inst) return { erro: "Instância não encontrada." };
  if (dispensar && inst.entregue_em) return { erro: "Já entregue; reabra antes de dispensar." };
  const { error } = await supabase
    .from("obrigacao_instancia")
    .update({ status: dispensar ? "dispensada" : "pendente" })
    .eq("id", instanciaId);
  if (error) return { erro: "Falha ao atualizar." };
  revalidatePath("/obrigacoes");
  revalidatePath(`/clientes/${inst.cliente_id}`);
  return { ok: true };
}

export async function urlComprovante(instanciaId: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("obrigacao_instancia")
    .select("comprovante_path")
    .eq("id", instanciaId)
    .maybeSingle();
  if (!data?.comprovante_path) return { erro: "Sem comprovante." };
  const admin = createAdminSupabase();
  const { data: signed, error } = await admin.storage
    .from("documentos")
    .createSignedUrl(data.comprovante_path as string, 60);
  if (error || !signed?.signedUrl) return { erro: "Não foi possível gerar o link." };
  return { url: signed.signedUrl };
}
