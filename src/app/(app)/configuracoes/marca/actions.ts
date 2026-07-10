"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizarMarca, tipoImagem } from "@/lib/escritorio/marca";

export type EstadoMarca = { erro?: string; ok?: boolean };

async function exigirAdmin(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && perfil.papel === "admin");
}

export async function salvarMarca(_prev: EstadoMarca, formData: FormData): Promise<EstadoMarca> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const dados = normalizarMarca(formData);
  if ("erro" in dados) return { erro: dados.erro };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("escritorio_config").update(dados).eq("id", 1);
  if (error) return { erro: "Falha ao salvar a marca." };
  revalidatePath("/configuracoes/marca");
  return { ok: true };
}

export async function salvarLogo(_prev: EstadoMarca, formData: FormData): Promise<EstadoMarca> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const arquivo = formData.get("logo") as File | null;
  if (!arquivo || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 2 * 1024 * 1024) return { erro: "Logo acima de 2 MB." };
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoImagem(buf);
  if (!tipo) return { erro: "Envie uma imagem PNG ou JPG." };

  const admin = createAdminSupabase();
  const supabase = await createServerSupabase();
  const { data: atual } = await supabase.from("escritorio_config").select("logo_path").eq("id", 1).maybeSingle();

  const path = `marca/logo-${Date.now()}.${tipo}`;
  const { error: upErr } = await admin.storage
    .from("documentos")
    .upload(path, buf, { contentType: tipo === "png" ? "image/png" : "image/jpeg", upsert: false });
  if (upErr) return { erro: "Falha ao enviar o logo." };

  const { error } = await supabase.from("escritorio_config").update({ logo_path: path }).eq("id", 1);
  if (error) {
    await admin.storage.from("documentos").remove([path]); // não deixa órfão se o update falhar
    return { erro: "Falha ao salvar o logo." };
  }
  // remove o logo anterior, se havia
  if (atual?.logo_path) await admin.storage.from("documentos").remove([atual.logo_path]);
  revalidatePath("/configuracoes/marca");
  return { ok: true };
}

export async function urlLogoAtual(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("escritorio_config").select("logo_path").eq("id", 1).maybeSingle();
  if (!data?.logo_path) return null;
  const admin = createAdminSupabase();
  const { data: signed } = await admin.storage.from("documentos").createSignedUrl(data.logo_path, 60);
  return signed?.signedUrl ?? null;
}
