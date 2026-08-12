import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";
import { descomprimirXmlNfse } from "@/lib/nfse/xml";
import { parsearNfseXml } from "@/lib/nfse/danfse-parse";
import { montarDanfseHtml } from "@/lib/nfse/danfse-html";
import { converterPdfHtml } from "@/lib/contrato/gerar";
import QRCode from "qrcode";

type Admin = ReturnType<typeof createAdminSupabase>;

// Gera o DANFSe no layout oficial v2.0 a partir do XML autorizado e o renderiza em PDF pelo
// Gotenberg. Desde a NT SE/CGNFS-e nº 008/2026 (corte 03/08/2026) a API de download do DANFSe
// do ambiente nacional (ADN) foi descontinuada — o padrão passou a exigir que o próprio
// emissor gere o documento conforme o layout v2.0. Este é, portanto, o caminho oficial.
async function danfseViaGotenberg(admin: Admin, chave: string): Promise<Buffer | null> {
  try {
    const { data } = await admin.from("nfse").select("nfse_xml, cliente_id").eq("chave_acesso", chave).maybeSingle();
    if (!data?.nfse_xml) return null;
    const dados = parsearNfseXml(descomprimirXmlNfse(data.nfse_xml as string));
    // O XML só traz o código IBGE do município do tomador; resolve o nome pelo cadastro.
    if (data.cliente_id) {
      const { data: cli } = await admin.from("clientes").select("endereco").eq("id", data.cliente_id).maybeSingle();
      const end = (cli?.endereco ?? {}) as { cidade?: string; uf?: string };
      if (end.cidade) dados.tomador.endereco.municipio = end.cidade;
      if (end.uf) dados.tomador.endereco.uf = end.uf;
    }
    // Telefone/e-mail do prestador (o escritório) vêm do cadastro, não do XML v1.0.
    const { data: cfg } = await admin.from("escritorio_config").select("email, telefone").eq("id", 1).maybeSingle();
    if (cfg?.telefone) dados.prestador.telefone = cfg.telefone as string;
    if (cfg?.email) dados.prestador.email = cfg.email as string;
    const qr = await QRCode.toDataURL(`https://www.nfse.gov.br/consultapublica?tpc=1&chNFSe=${chave}`, {
      margin: 0,
      width: 200,
    }).catch(() => "");
    return await converterPdfHtml(montarDanfseHtml(dados, qr));
  } catch {
    return null;
  }
}

export function caminhoDanfse(chave: string): string {
  return `danfse/${chave}.pdf`;
}

export async function lerDanfseStorage(admin: Admin, chave: string): Promise<Buffer | null> {
  const { data } = await admin.storage.from("documentos").download(caminhoDanfse(chave));
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function guardarDanfseStorage(admin: Admin, chave: string, pdf: Buffer): Promise<void> {
  await admin.storage
    .from("documentos")
    .upload(caminhoDanfse(chave), pdf, { contentType: "application/pdf", upsert: true })
    .catch(() => {});
}

export async function carregarCertRowDaNota(
  admin: Admin,
  emitente: string,
  clienteId: string,
): Promise<{ pfx_cifrado: string; senha_cifrada: string } | null> {
  if (emitente === "cliente") {
    const { data } = await admin
      .from("nfse_certificado_cliente")
      .select("pfx_cifrado, senha_cifrada")
      .eq("cliente_id", clienteId)
      .maybeSingle();
    return data ?? null;
  }
  const { data } = await admin.from("nfse_certificado").select("pfx_cifrado, senha_cifrada").eq("id", 1).maybeSingle();
  return data ?? null;
}

export type NotaDanfse = { chave_acesso: string; ambiente: string | null; emitente: string; cliente_id: string };

// DANFSe fiel ao oficial v2.0 para uso (envio, download, "Preparar notas"): cache-first e, na
// falta, gera pelo XML autorizado e guarda no cache. Como o ADN foi descontinuado (NT 008/2026),
// não há mais download do oficial — o documento gerado aqui É o oficial. O cache no Storage
// preserva DANFSes já baixados do ADN antes do corte, que continuam válidos.
export async function gerarDanfseFiel(
  admin: Admin,
  nota: NotaDanfse,
): Promise<{ pdfBase64?: string; chave?: string; erro?: string }> {
  const chave = nota.chave_acesso;
  if (!chave) return { erro: "Nota sem chave de acesso." };
  const cache = await lerDanfseStorage(admin, chave);
  if (cache) return { pdfBase64: cache.toString("base64"), chave };
  const fiel = await danfseViaGotenberg(admin, chave);
  if (!fiel) {
    return { erro: "Não foi possível gerar o DANFSe (XML da nota ausente ou serviço de PDF indisponível).", chave };
  }
  await guardarDanfseStorage(admin, chave, fiel);
  return { pdfBase64: fiel.toString("base64"), chave };
}
