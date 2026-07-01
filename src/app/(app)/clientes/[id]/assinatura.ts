"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarDocumentos } from "@/lib/clientes/permissoes";
import { enviarParaAssinatura } from "@/lib/assinatura/clicksign";
import type { SignatarioInput } from "@/lib/assinatura/tipos";

export type EstadoAssinatura = { erro?: string; ok?: boolean };

function sig(formData: FormData, prefixo: string, papel: SignatarioInput["papel"]): SignatarioInput | null {
  const nome = String(formData.get(`${prefixo}_nome`) ?? "").trim();
  // e-mail normalizado (lowercase) para casar com o que a Clicksign devolve no webhook.
  const email = String(formData.get(`${prefixo}_email`) ?? "").trim().toLowerCase();
  if (!nome || !email) return null;
  return { nome, email, papel };
}

export async function enviarAssinatura(
  documentoId: string,
  clienteId: string,
  _prev: EstadoAssinatura,
  formData: FormData,
): Promise<EstadoAssinatura> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo) return { erro: "Sessão expirada ou conta inativa." };
  if (!podeGerenciarDocumentos(perfil.papel)) return { erro: "Sem permissão para enviar para assinatura." };

  // Signatários: contratante (cliente) + contratada (escritório) + testemunhas (opcionais)
  const contratante = sig(formData, "contratante", "contratante");
  const contratada = sig(formData, "contratada", "contratada");
  if (!contratante) return { erro: "Informe nome e e-mail do cliente (CONTRATANTE)." };
  if (!contratada) return { erro: "Informe nome e e-mail do representante do escritório." };
  const signatarios: SignatarioInput[] = [contratante, contratada];
  if (formData.get("incluir_testemunhas") === "on") {
    const t1 = sig(formData, "t1", "testemunha");
    const t2 = sig(formData, "t2", "testemunha");
    if (!t1 || !t2) return { erro: "Preencha nome e e-mail das duas testemunhas (ou desmarque)." };
    signatarios.push(t1, t2);
  }

  // Baixa o PDF do contrato (RLS: confirma acesso ao documento). Exige que o
  // documento pertença ao cliente informado (evita vincular contrato de um
  // cliente sob outro cliente que o usuário também acessa).
  const supabase = await createServerSupabase();
  const { data: doc } = await supabase
    .from("documentos")
    .select("nome, caminho_storage")
    .eq("id", documentoId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!doc) return { erro: "Documento não encontrado ou sem permissão." };

  const admin = createAdminSupabase();
  const baixado = await admin.storage.from("documentos").download(doc.caminho_storage);
  if (baixado.error || !baixado.data) return { erro: "Falha ao ler o contrato." };
  const pdf = Buffer.from(await baixado.data.arrayBuffer());

  let resultado;
  try {
    resultado = await enviarParaAssinatura({ pdf, nome: doc.nome.replace(/\.pdf$/i, ""), signatarios });
  } catch (e) {
    console.error("enviarAssinatura:", e instanceof Error ? e.message : e);
    return { erro: "Falha ao enviar para a Clicksign. Tente novamente." };
  }

  // Persiste (após o envelope existir): assinaturas + signatários.
  const { data: assinatura, error: aErr } = await supabase
    .from("assinaturas")
    .insert({
      cliente_id: clienteId,
      documento_id: documentoId,
      clicksign_envelope_id: resultado.envelopeId,
      clicksign_document_id: resultado.documentId,
      status: "enviado",
    })
    .select("id")
    .single();
  if (aErr || !assinatura) return { erro: "Enviado, mas falhou ao registrar. Verifique na Clicksign." };

  const { error: sigErr } = await supabase.from("assinatura_signatarios").insert(
    resultado.signatarios.map((s) => ({
      assinatura_id: assinatura.id,
      nome: s.nome,
      email: s.email,
      papel: s.papel,
      clicksign_key: s.clicksignKey,
      status: "pendente",
    })),
  );
  if (sigErr) {
    // O envelope já foi enviado; o status geral se auto-cura no fechamento, mas
    // a lista por signatário fica vazia. Loga para diagnóstico.
    console.error("enviarAssinatura signatarios:", sigErr.message);
  }

  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
