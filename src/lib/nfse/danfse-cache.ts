import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { baixarDanfsePdf } from "@/lib/nfse/danfse";
import { descomprimirXmlNfse } from "@/lib/nfse/xml";
import { parsearNfseXml } from "@/lib/nfse/danfse-parse";
import { montarDanfseHtml } from "@/lib/nfse/danfse-html";
import { converterPdfHtml } from "@/lib/contrato/gerar";
import QRCode from "qrcode";

type Admin = ReturnType<typeof createAdminSupabase>;

// Fallback quando o ADN não entrega o oficial: monta o DANFSe em HTML (layout oficial) a
// partir do XML autorizado e renderiza em PDF pelo Gotenberg. Preferido o oficial; este só
// entra na falta dele, e não é cacheado (para voltar ao oficial quando o ADN normalizar).
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

// Só o DANFSe OFICIAL: cache-first + ADN (com retry). Sem fallback — usado pelo "Preparar
// notas", que quer popular o cache com o oficial e reportar o erro real do ADN.
export async function baixarDanfseOficial(
  admin: Admin,
  nota: NotaDanfse,
): Promise<{ pdfBase64?: string; chave?: string; erro?: string }> {
  const chave = nota.chave_acesso;
  if (!chave) return { erro: "Nota sem chave de acesso." };
  const cache = await lerDanfseStorage(admin, chave);
  if (cache) return { pdfBase64: cache.toString("base64"), chave };
  const certRow = await carregarCertRowDaNota(admin, nota.emitente, nota.cliente_id);
  if (!certRow) return { erro: "Certificado não cadastrado.", chave };
  let cert;
  try {
    const pfx = await decifrarDominio("nfse", certRow.pfx_cifrado);
    const senha = (await decifrarDominio("nfse", certRow.senha_cifrada)).toString("utf8");
    cert = carregarCertificado(pfx, senha);
  } catch {
    return { erro: "Falha ao abrir o certificado.", chave };
  }
  const ambiente: "homologacao" | "producao" = nota.ambiente === "producao" ? "producao" : "homologacao";
  // Retry paciente para instabilidade do ADN (503/502, rate limit 429, timeout, rede): espera
  // e tenta de novo. Erro permanente (404 sem nota, certificado) não insiste.
  const esperas = [0, 3000];
  let ultimoErro = "indisponível";
  for (const espera of esperas) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    const r = await baixarDanfsePdf(chave, { pfx: cert.pfx, senha: cert.senha }, ambiente);
    if ("pdf" in r) {
      await guardarDanfseStorage(admin, chave, r.pdf);
      return { pdfBase64: r.pdf.toString("base64"), chave };
    }
    ultimoErro = r.erro;
    if (!/HTTP 5\d\d|HTTP 429|tempo esgotado|rede|TLS/i.test(r.erro)) break;
  }
  return { erro: `DANFSe indisponível — ${ultimoErro}`, chave };
}

// DANFSe para USO (envio/download): tenta o oficial e, se o ADN não entrega, gera o DANFSe
// fiel via HTML→Gotenberg — assim o envio não trava. Volta ao oficial quando o ADN normaliza.
export async function obterDanfsePdf(
  admin: Admin,
  nota: NotaDanfse,
): Promise<{ pdfBase64?: string; chave?: string; erro?: string }> {
  const r = await baixarDanfseOficial(admin, nota);
  if (r.pdfBase64) return r;
  if (r.chave) {
    const fiel = await danfseViaGotenberg(admin, r.chave);
    if (fiel) return { pdfBase64: fiel.toString("base64"), chave: r.chave };
  }
  return r;
}
