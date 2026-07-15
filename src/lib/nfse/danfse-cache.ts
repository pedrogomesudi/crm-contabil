import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";
import { carregarCertificado } from "@/lib/nfse/certificado";
import { baixarDanfsePdf } from "@/lib/nfse/danfse";

type Admin = ReturnType<typeof createAdminSupabase>;

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

// Cache-first + ADN. O caller fornece a nota (respeitando o próprio gate/RLS).
export async function obterDanfsePdf(admin: Admin, nota: NotaDanfse): Promise<{ pdfBase64?: string; chave?: string; erro?: string }> {
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
  const pdf = await baixarDanfsePdf(chave, { pfx: cert.pfx, senha: cert.senha }, ambiente);
  if (!pdf) return { erro: "DANFSe indisponível no momento.", chave };
  await guardarDanfseStorage(admin, chave, pdf);
  return { pdfBase64: pdf.toString("base64"), chave };
}
