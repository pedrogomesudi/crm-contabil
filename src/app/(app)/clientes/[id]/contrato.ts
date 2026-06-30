"use server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { montarDadosContrato, type ClienteContrato } from "@/lib/contrato/dados";
import { gerarDocx, converterPdf } from "@/lib/contrato/gerar";

export type EstadoContrato = { erro?: string; ok?: boolean; avisos?: string[] };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function gerarContrato(
  clienteId: string,
  _prev: EstadoContrato,
  formData: FormData,
): Promise<EstadoContrato> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!podeVerHonorario(perfil.papel)) return { erro: "Sem permissão para gerar contrato." };

  const vigencia = String(formData.get("vigencia_inicio") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia)) return { erro: "Informe a data de início da vigência." };

  const supabase = await createServerSupabase();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, endereco, email, telefone, responsavel_nome, representante")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) return { erro: "Cliente não encontrado ou sem permissão." };

  const { data: fin } = await supabase
    .from("clientes_financeiro")
    .select("honorario_mensal")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const honorario = fin?.honorario_mensal != null ? Number(fin.honorario_mensal) : null;

  const { dados, faltando } = montarDadosContrato(cliente as ClienteContrato, honorario, vigencia);

  let template: Buffer;
  try {
    template = readFileSync(join(process.cwd(), "templates", "contrato-prestacao-servicos.docx"));
  } catch {
    return { erro: "Modelo de contrato indisponível." };
  }

  let docx: Buffer;
  try {
    docx = gerarDocx(template, dados);
  } catch (e) {
    console.error("gerarContrato (docx):", e);
    return { erro: "Falha ao preencher o contrato." };
  }
  const pdf = await converterPdf(docx);

  const admin = createAdminSupabase();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const baseNome = `contrato-${stamp}`;
  const avisos: string[] = [];
  if (faltando.length) avisos.push(`Gerado com campos em branco: ${faltando.join(", ")}.`);

  const subir = async (buf: Buffer, ext: string, mime: string) => {
    const caminho = `${clienteId}/${baseNome}.${ext}`;
    const up = await admin.storage.from("documentos").upload(caminho, buf, { contentType: mime });
    if (up.error) return false;
    const { error } = await admin.from("documentos").insert({
      cliente_id: clienteId,
      nome: `${baseNome}.${ext}`,
      tipo: "Contrato",
      caminho_storage: caminho,
      enviado_por: perfil.id,
    });
    if (error) {
      await admin.storage.from("documentos").remove([caminho]);
      return false;
    }
    return true;
  };

  if (!(await subir(docx, "docx", DOCX_MIME))) return { erro: "Falha ao salvar o contrato (Word)." };
  if (pdf) {
    if (!(await subir(pdf, "pdf", "application/pdf"))) avisos.push("PDF gerado mas não salvo.");
  } else {
    avisos.push("PDF não gerado (serviço de conversão indisponível). Word salvo.");
  }

  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true, avisos };
}
