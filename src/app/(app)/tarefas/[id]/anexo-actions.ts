"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { caminhoAnexoTarefa } from "@/lib/tarefas/anexo";
import type { EstadoUpload, ResultadoDownload, ResultadoExcluir } from "@/app/(app)/documentos/estados";

const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;

// Espelha a RLS de tarefa: admin/assistente OU responsável/criador da tarefa.
async function podeEditarTarefa(perfilId: string, papel: string, tarefaId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("tarefa").select("responsavel_id, criado_por").eq("id", tarefaId).maybeSingle();
  if (!data) return false;
  if (papel === "admin" || papel === "assistente") return true;
  return data.responsavel_id === perfilId || data.criado_por === perfilId;
}

export async function anexarTarefaArquivo(
  tarefaId: string,
  _prev: EstadoUpload,
  formData: FormData,
): Promise<EstadoUpload> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!(await podeEditarTarefa(perfil.id, perfil.papel, tarefaId))) {
    return { erro: "Você não pode anexar arquivos a esta tarefa." };
  }

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { erro: "Selecione um arquivo." };
  if (file.size > MAX_BYTES) return { erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(file.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  const caminho = caminhoAnexoTarefa(tarefaId, file.name, crypto.randomUUID());
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, file, { contentType: file.type });
  if (up.error) {
    console.error("anexarTarefaArquivo (upload):", up.error.message);
    return { erro: "Falha no upload do arquivo." };
  }
  const { error: errInsert } = await admin.from("tarefa_anexo").insert({
    tarefa_id: tarefaId,
    nome: file.name,
    caminho_storage: caminho,
    enviado_por: perfil.id,
  });
  if (errInsert) {
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarTarefaArquivo (insert):", errInsert.message);
    return { erro: "Falha ao registrar o anexo." };
  }
  revalidatePath(`/tarefas/${tarefaId}`);
  return { ok: true };
}

export async function listarAnexosTarefa(
  tarefaId: string,
): Promise<{ id: string; nome: string; enviado_em: string }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tarefa_anexo")
    .select("id, nome, enviado_em")
    .eq("tarefa_id", tarefaId)
    .order("enviado_em", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id as string,
    nome: a.nome as string,
    enviado_em: a.enviado_em as string,
  }));
}

export async function linkDownloadAnexo(anexoId: string): Promise<ResultadoDownload> {
  const supabase = await createServerSupabase();
  // A RLS de tarefa_anexo já garante que o usuário enxerga o anexo (via tarefa).
  const { data: anexo } = await supabase.from("tarefa_anexo").select("caminho_storage").eq("id", anexoId).maybeSingle();
  if (!anexo) return { erro: "Anexo não encontrado ou sem permissão." };
  const admin = createAdminSupabase();
  const { data: signed, error } = await admin.storage
    .from("documentos")
    .createSignedUrl(anexo.caminho_storage as string, 60);
  if (error || !signed) return { erro: "Falha ao gerar o link." };
  return { url: signed.signedUrl };
}

export async function excluirAnexo(anexoId: string, tarefaId: string): Promise<ResultadoExcluir> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!(await podeEditarTarefa(perfil.id, perfil.papel, tarefaId))) {
    return { erro: "Você não pode remover anexos desta tarefa." };
  }
  const admin = createAdminSupabase();
  const { data: anexo } = await admin.from("tarefa_anexo").select("caminho_storage").eq("id", anexoId).maybeSingle();
  if (!anexo) return { erro: "Anexo não encontrado." };
  const { error } = await admin.from("tarefa_anexo").delete().eq("id", anexoId);
  if (error) return { erro: "Falha ao remover o anexo." };
  const { error: errRm } = await admin.storage.from("documentos").remove([anexo.caminho_storage as string]);
  if (errRm) console.error("excluirAnexo (storage órfão):", errRm.message);
  revalidatePath(`/tarefas/${tarefaId}`);
  return { ok: true };
}
