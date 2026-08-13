import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { nomeArquivoBoleto } from "@/lib/nfse/nomeArquivo";

type Admin = ReturnType<typeof createAdminSupabase>;

// Razão social do cliente dono do boleto (boleto → titulo → cliente). Usa o admin para não
// depender de RLS (funciona igual no painel da equipe e no portal do cliente).
async function razaoSocialDoBoleto(admin: Admin, boletoId: string): Promise<string> {
  const { data: b } = await admin.from("boleto").select("titulo_id").eq("id", boletoId).maybeSingle();
  if (!b?.titulo_id) return "";
  const { data: t } = await admin.from("titulo").select("cliente_id").eq("id", b.titulo_id).maybeSingle();
  if (!t?.cliente_id) return "";
  const { data: c } = await admin.from("clientes").select("razao_social").eq("id", t.cliente_id).maybeSingle();
  return (c?.razao_social as string) ?? "";
}

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

// Assina uma URL de download do PDF do boleto. O arquivo baixado é nomeado "boleto - {razão
// social}.pdf" (padronizado como as notas fiscais); sem razão social, cai em "boleto-{número}".
export async function assinarPdfBoleto(path: string, boletoId: string, numero: number): Promise<string | null> {
  const admin = createAdminSupabase();
  const razao = await razaoSocialDoBoleto(admin, boletoId);
  const nome = nomeArquivoBoleto(razao) || `boleto-${numero}`;
  const { data } = await admin.storage.from("boletos").createSignedUrl(path, 60, {
    download: `${nome}.pdf`,
  });
  return data?.signedUrl ?? null;
}
