"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarDocumentos } from "@/lib/clientes/permissoes";
import type { EstadoUpload, ResultadoDownload, ResultadoExcluir } from "./estados";

const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Sanitiza o nome para uso como object name no Storage (evita / .. e caracteres
// estranhos), preservando letras/números Unicode (acentos). O nome original é
// guardado em documentos.nome para exibição.
function nomeSeguro(nome: string): string {
  const limpo = nome.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^[._]+/, "");
  return limpo.length > 0 ? limpo.slice(0, 100) : "arquivo";
}

export async function anexarDocumento(
  clienteId: string,
  _prev: EstadoUpload,
  formData: FormData,
): Promise<EstadoUpload> {
  const perfil = await getPerfilAtual();
  // Actions rodam fora do layout (que bloqueia inativo): re-checa sessão E ativo.
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  // Upload roda via service_role (bypassa RLS): a permissão é checada aqui.
  if (!podeGerenciarDocumentos(perfil.papel)) {
    return { erro: "Você não tem permissão para anexar documentos." };
  }

  const supabase = await createServerSupabase();
  // Confirma que o usuário ENXERGA o cliente (RLS) antes de subir.
  const { data: cli } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return { erro: "Cliente não encontrado ou sem permissão." };

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { erro: "Selecione um arquivo." };
  if (file.size > MAX_BYTES) return { erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(file.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  // caminho_storage === object name em storage.objects (sem o prefixo do bucket).
  // UUID garante unicidade (evita colisão do índice UNIQUE em uploads simultâneos).
  const caminho = `${clienteId}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
  const admin = createAdminSupabase();
  const up = await admin.storage
    .from("documentos")
    .upload(caminho, file, { contentType: file.type });
  if (up.error) {
    console.error("anexarDocumento (upload):", up.error.message);
    return { erro: "Falha no upload do arquivo." };
  }

  const tipo = String(formData.get("tipo") ?? "")
    .trim()
    .slice(0, 60);
  const { error: errInsert } = await admin.from("documentos").insert({
    cliente_id: clienteId,
    nome: file.name,
    tipo: tipo || null,
    caminho_storage: caminho,
    enviado_por: perfil.id,
  });
  if (errInsert) {
    // Evita arquivo órfão no Storage se o registro no banco falhar.
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarDocumento (insert):", errInsert.message);
    return { erro: "Falha ao registrar o documento." };
  }

  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function gerarLinkDownload(documentoId: string): Promise<ResultadoDownload> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };

  const supabase = await createServerSupabase();
  // RLS garante que só vê documento de cliente visível ao usuário.
  const { data: doc } = await supabase
    .from("documentos")
    .select("caminho_storage")
    .eq("id", documentoId)
    .maybeSingle();
  if (!doc) return { erro: "Documento não encontrado ou sem permissão." };

  const admin = createAdminSupabase();
  // Gera o link primeiro; só registra o acesso SE o link saiu (evita log fantasma).
  const { data: signed, error: errSign } = await admin.storage
    .from("documentos")
    .createSignedUrl(doc.caminho_storage, 60);
  if (errSign || !signed?.signedUrl) {
    console.error("gerarLinkDownload (sign):", errSign?.message);
    return { erro: "Não foi possível gerar o link." };
  }

  // Auditoria do acesso (server-side, não-burlável).
  const { error: errLog } = await admin
    .from("log_acesso_documento")
    .insert({ documento_id: documentoId, usuario_id: perfil.id });
  if (errLog) console.error("gerarLinkDownload (log):", errLog.message);

  return { url: signed.signedUrl };
}

export async function excluirDocumento(
  documentoId: string,
  clienteId: string,
): Promise<ResultadoExcluir> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || perfil.papel !== "admin") {
    return { erro: "Apenas administradores ativos excluem documentos." };
  }

  const admin = createAdminSupabase();
  const { data: doc } = await admin
    .from("documentos")
    .select("caminho_storage")
    .eq("id", documentoId)
    .maybeSingle();
  if (doc) {
    // Ordem: DB primeiro (fonte da listagem/RLS), depois Storage. Se o registro
    // não sai, abortamos sem tocar no arquivo. O log sobrevive (ON DELETE SET NULL).
    const { error } = await admin.from("documentos").delete().eq("id", documentoId);
    if (error) {
      console.error("excluirDocumento (delete):", error.message);
      return { erro: "Não foi possível excluir o documento." };
    }
    // Registro já removido: um eventual arquivo órfão é tolerável (não aparece na
    // UI nem é baixável) — apenas logamos para limpeza posterior.
    const { error: errRm } = await admin.storage.from("documentos").remove([doc.caminho_storage]);
    if (errRm) console.error("excluirDocumento (storage órfão):", errRm.message);
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
