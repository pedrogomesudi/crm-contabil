import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { competenciaParaData } from "@/lib/documentos/taxonomia";
import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";
import { extrairTextoPdf } from "@/lib/documentos/extrair-texto";
import { emitir } from "@/lib/webhooks/emitir";

const MAX = 10 * 1024 * 1024;
const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg"];
const nomeSeguro = (nome: string) => {
  const limpo = nome.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^[._]+/, "");
  return limpo.length > 0 ? limpo.slice(0, 100) : "arquivo";
};

async function indexar(admin: SupabaseClient, id: string, mime: string, bytes: Uint8Array) {
  try {
    if (mime !== "application/pdf") {
      await admin.from("documentos").update({ texto_status: "vazio" }).eq("id", id);
      return;
    }
    const { texto, status } = await extrairTextoPdf(bytes);
    await admin
      .from("documentos")
      .update({ texto_extraido: texto || null, texto_status: status })
      .eq("id", id);
  } catch (e) {
    console.error("indexar (documento):", e instanceof Error ? e.message : e);
    await admin.from("documentos").update({ texto_status: "erro" }).eq("id", id);
  }
}

export type DocumentoUploadInput = {
  clienteId: string;
  arquivo: { bytes: Uint8Array; nome: string; mime: string };
  tipoId?: string | null;
  departamentoManual?: string;
  competenciaRaw?: string;
  tipoTextoLivre?: string;
};
export async function anexarDocumentoNucleo(
  input: DocumentoUploadInput,
  ctx: { admin: SupabaseClient; autorId: string | null },
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { bytes, nome, mime } = input.arquivo;
  if (!bytes.byteLength) return { ok: false, erro: "Arquivo vazio." };
  if (bytes.byteLength > MAX) return { ok: false, erro: "Arquivo acima de 10 MB." };
  if (!TIPOS_OK.includes(mime)) return { ok: false, erro: "Tipo não permitido (PDF, PNG ou JPG)." };

  const caminho = `${input.clienteId}/${crypto.randomUUID()}-${nomeSeguro(nome)}`;
  const up = await ctx.admin.storage.from("documentos").upload(caminho, bytes, { contentType: mime });
  if (up.error) return { ok: false, erro: "Falha no upload do arquivo." };

  const tipoId = input.tipoId || null;
  const tipos = tipoId ? await carregarTiposAtivos() : [];
  const tipoSel = tipoId ? tipos.find((t) => t.id === tipoId) : undefined;
  if (tipoId && !tipoSel) {
    await ctx.admin.storage.from("documentos").remove([caminho]);
    return { ok: false, erro: "Tipo de documento inválido." };
  }
  const departamento = (input.departamentoManual ?? "").trim() || tipoSel?.departamento || null;
  const competencia = competenciaParaData(input.competenciaRaw ?? "");
  const tipoLabel = tipoSel?.nome ?? ((input.tipoTextoLivre ?? "").trim().slice(0, 60) || null);

  const { data: novo, error } = await ctx.admin
    .from("documentos")
    .insert({
      cliente_id: input.clienteId,
      nome,
      tipo: tipoLabel,
      tipo_id: tipoId,
      departamento,
      competencia,
      caminho_storage: caminho,
      enviado_por: ctx.autorId,
    })
    .select("id")
    .single();
  if (error || !novo) {
    await ctx.admin.storage.from("documentos").remove([caminho]);
    return { ok: false, erro: "Falha ao registrar o documento." };
  }
  const id = novo.id as string;
  await indexar(ctx.admin, id, mime, bytes);
  await emitir("documento.enviado", id);
  return { ok: true, id };
}
