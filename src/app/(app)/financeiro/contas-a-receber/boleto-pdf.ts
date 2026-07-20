import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorAtivo } from "@/lib/boleto/ativo";

// Garante o PDF do boleto no Storage e devolve o caminho; null se o provedor não expõe PDF.
export async function garantirPdfBoleto(boletoId: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data: b } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, pdf_path")
    .eq("id", boletoId)
    .maybeSingle();
  if (!b) return null;
  if (b.pdf_path) return b.pdf_path as string;
  if (b.provedor !== "inter" || !b.provedor_boleto_id) return null;
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo || typeof ativo.adaptador.pdf !== "function") return null;
  const base64 = await ativo.adaptador.pdf(b.provedor_boleto_id as string);
  if (!base64) return null;
  const caminho = `${boletoId}.pdf`;
  const buf = Buffer.from(base64, "base64");
  const up = await admin.storage.from("boletos").upload(caminho, buf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) return null;
  await admin.from("boleto").update({ pdf_path: caminho }).eq("id", boletoId);
  return caminho;
}

export async function assinarPdfBoleto(path: string, numero: number): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from("boletos").createSignedUrl(path, 60, {
    download: `boleto-${numero}.pdf`,
  });
  return data?.signedUrl ?? null;
}
