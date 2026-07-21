"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarDocumentos } from "@/lib/clientes/permissoes";
import { competenciaParaData } from "@/lib/documentos/taxonomia";
import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";
import { escapeLike } from "@/lib/clientes/busca";
import { agruparVersoes } from "@/lib/documentos/versoes";
import { extrairTextoPdf } from "@/lib/documentos/extrair-texto";
import type { FiltroResolvido } from "@/lib/documentos/busca-metadados";
import type { EstadoUpload, ResultadoDownload, ResultadoExcluir } from "./estados";

// Indexa o conteúdo do PDF após o upload. Best-effort: o documento já foi gravado, então
// qualquer falha aqui só afeta a busca por conteúdo, nunca o upload. Sem OCR: não-PDF = 'vazio'.
async function indexarConteudo(admin: ReturnType<typeof createAdminSupabase>, id: string, file: File): Promise<void> {
  try {
    if (file.type !== "application/pdf") {
      await admin.from("documentos").update({ texto_status: "vazio" }).eq("id", id);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { texto, status } = await extrairTextoPdf(bytes);
    await admin
      .from("documentos")
      .update({ texto_extraido: texto || null, texto_status: status })
      .eq("id", id);
  } catch (e) {
    console.error("indexarConteudo:", e instanceof Error ? e.message : e);
    await admin.from("documentos").update({ texto_status: "erro" }).eq("id", id);
  }
}

export type DocBusca = {
  id: string;
  nome: string;
  clienteId: string;
  clienteNome: string;
  tipo: string | null;
  departamento: string | null;
  competencia: string | null;
  enviado_em: string;
};

export async function buscarDocumentos(f: FiltroResolvido): Promise<DocBusca[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from("documentos")
    .select("id, nome, tipo, departamento, competencia, enviado_em, substitui_id, cliente_id, clientes(razao_social)")
    .order("enviado_em", { ascending: false })
    .limit(100);
  if (f.nome) q = q.ilike("nome", `%${escapeLike(f.nome)}%`);
  if (f.tipoId) q = q.eq("tipo_id", f.tipoId);
  if (f.departamento) q = q.eq("departamento", f.departamento);
  if (f.clienteId) q = q.eq("cliente_id", f.clienteId);
  if (f.compInicio) q = q.gte("competencia", f.compInicio);
  if (f.compFim) q = q.lt("competencia", f.compFim);
  const { data } = await q;

  const linhas = (data ?? []).map((d) => {
    const cli = d.clientes as unknown as { razao_social: string } | null;
    return {
      id: d.id as string,
      nome: d.nome as string,
      substitui_id: (d.substitui_id as string | null) ?? null,
      clienteId: d.cliente_id as string,
      clienteNome: cli?.razao_social ?? "—",
      tipo: (d.tipo as string | null) ?? null,
      departamento: (d.departamento as string | null) ?? null,
      competencia: (d.competencia as string | null) ?? null,
      enviado_em: d.enviado_em as string,
    };
  });
  // Só versões atuais entre os resultados (as substituídas herdam a taxonomia, então ambas
  // aparecem quando o filtro casa — agruparVersoes mantém só a atual).
  return agruparVersoes(linhas).map((g) => {
    const { substitui_id: _s, ...rest } = g.atual;
    void _s;
    return rest;
  });
}

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export type DocVencido = {
  id: string;
  nome: string;
  clienteId: string;
  clienteNome: string;
  tipo: string | null;
  competencia: string | null;
  venceEm: string;
};

export async function listarVencidos(): Promise<DocVencido[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("documento_retencao")
    .select("id, nome, cliente_id, cliente_nome, tipo, competencia, vence_em")
    .lt("vence_em", hojeSP())
    .order("vence_em", { ascending: true })
    .limit(100);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    nome: d.nome as string,
    clienteId: d.cliente_id as string,
    clienteNome: (d.cliente_nome as string | null) ?? "—",
    tipo: (d.tipo as string | null) ?? null,
    competencia: (d.competencia as string | null) ?? null,
    venceEm: d.vence_em as string,
  }));
}

export async function contarDocsVencidos(): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("documento_retencao")
    .select("id", { count: "exact", head: true })
    .lt("vence_em", hojeSP());
  return count ?? 0;
}

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
  const { data: cli } = await supabase.from("clientes").select("id").eq("id", clienteId).maybeSingle();
  if (!cli) return { erro: "Cliente não encontrado ou sem permissão." };

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { erro: "Selecione um arquivo." };
  if (file.size > MAX_BYTES) return { erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(file.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  // caminho_storage === object name em storage.objects (sem o prefixo do bucket).
  // UUID garante unicidade (evita colisão do índice UNIQUE em uploads simultâneos).
  const caminho = `${clienteId}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, file, { contentType: file.type });
  if (up.error) {
    console.error("anexarDocumento (upload):", up.error.message);
    return { erro: "Falha no upload do arquivo." };
  }

  // Taxonomia (RF-060): tipo do catálogo (denormaliza o nome em `tipo` para não quebrar o caso
  // `d.tipo === "Contrato"`), departamento (do form ou sugerido pelo tipo) e competência (mês/ano).
  const tipoId = String(formData.get("tipo_id") ?? "") || null;
  const tipos = tipoId ? await carregarTiposAtivos() : [];
  const tipoSel = tipoId ? tipos.find((t) => t.id === tipoId) : undefined;
  if (tipoId && !tipoSel) {
    await admin.storage.from("documentos").remove([caminho]);
    return { erro: "Tipo de documento inválido." };
  }
  const depRaw = String(formData.get("departamento") ?? "").trim();
  const departamento = depRaw || tipoSel?.departamento || null;
  const competencia = competenciaParaData(String(formData.get("competencia") ?? ""));
  const tipoLabel =
    tipoSel?.nome ??
    (String(formData.get("tipo") ?? "")
      .trim()
      .slice(0, 60) ||
      null);
  const { data: novo, error: errInsert } = await admin
    .from("documentos")
    .insert({
      cliente_id: clienteId,
      nome: file.name,
      tipo: tipoLabel,
      tipo_id: tipoId,
      departamento,
      competencia,
      caminho_storage: caminho,
      enviado_por: perfil.id,
    })
    .select("id")
    .single();
  if (errInsert || !novo) {
    // Evita arquivo órfão no Storage se o registro no banco falhar.
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarDocumento (insert):", errInsert?.message);
    return { erro: "Falha ao registrar o documento." };
  }

  await indexarConteudo(admin, novo.id, file);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

// RF-060 (Fatia B): nova versão de um documento — herda a taxonomia do antigo e grava substitui_id.
export async function anexarNovaVersao(
  documentoAntigoId: string,
  _prev: EstadoUpload,
  formData: FormData,
): Promise<EstadoUpload> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!podeGerenciarDocumentos(perfil.papel)) {
    return { erro: "Você não tem permissão para anexar documentos." };
  }

  const supabase = await createServerSupabase();
  // A RLS prova que o usuário enxerga o documento antigo (logo, o cliente).
  const { data: antigo } = await supabase
    .from("documentos")
    .select("cliente_id, tipo, tipo_id, departamento, competencia")
    .eq("id", documentoAntigoId)
    .maybeSingle();
  if (!antigo) return { erro: "Documento não encontrado ou sem permissão." };

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { erro: "Selecione um arquivo." };
  if (file.size > MAX_BYTES) return { erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(file.type)) return { erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  const clienteId = antigo.cliente_id as string;
  const caminho = `${clienteId}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, file, { contentType: file.type });
  if (up.error) {
    console.error("anexarNovaVersao (upload):", up.error.message);
    return { erro: "Falha no upload do arquivo." };
  }
  const { data: novo, error: errInsert } = await admin
    .from("documentos")
    .insert({
      cliente_id: clienteId,
      nome: file.name,
      tipo: antigo.tipo,
      tipo_id: antigo.tipo_id,
      departamento: antigo.departamento,
      competencia: antigo.competencia,
      caminho_storage: caminho,
      enviado_por: perfil.id,
      substitui_id: documentoAntigoId,
    })
    .select("id")
    .single();
  if (errInsert || !novo) {
    await admin.storage.from("documentos").remove([caminho]);
    console.error("anexarNovaVersao (insert):", errInsert?.message);
    return { erro: "Falha ao registrar a nova versão." };
  }
  await indexarConteudo(admin, novo.id, file);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function gerarLinkDownload(documentoId: string): Promise<ResultadoDownload> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };

  const supabase = await createServerSupabase();
  // RLS garante que só vê documento de cliente visível ao usuário.
  const { data: doc } = await supabase.from("documentos").select("caminho_storage").eq("id", documentoId).maybeSingle();
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

export async function excluirDocumento(documentoId: string, clienteId: string): Promise<ResultadoExcluir> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || perfil.papel !== "admin") {
    return { erro: "Apenas administradores ativos excluem documentos." };
  }

  const admin = createAdminSupabase();
  const { data: doc } = await admin.from("documentos").select("caminho_storage").eq("id", documentoId).maybeSingle();
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
