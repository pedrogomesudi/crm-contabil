"use server";
import { revalidatePath } from "next/cache";
import PizZip from "pizzip";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { montarTermoHtml, ACERVO_PADRAO } from "@/lib/legalizacao/termo";
import { converterPdfHtml } from "@/lib/contrato/gerar";
import { sanitizarHtml } from "@/lib/comercial/gerar-proposta";
import { formatarEnderecoLinha } from "@/lib/comercial/proposta-template";
import { agruparVersoes } from "@/lib/documentos/versoes";
import { nomeEntradaZip } from "@/lib/documentos/acervo";

const TETO_DOCS = 200;

export async function gerarPacoteDevolucao(
  clienteId: string,
): Promise<{ zipBase64?: string; nome?: string; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil || !perfil.ativo || !podeCriarCliente(perfil.papel)) {
    return { erro: "Você não tem permissão para gerar o pacote." };
  }
  const supabase = await createServerSupabase();
  const { data: cli } = await supabase.from("clientes").select("razao_social").eq("id", clienteId).maybeSingle();
  if (!cli) return { erro: "Cliente não encontrado ou sem permissão." };

  // Documentos atuais do cliente (RLS pela sessão).
  const { data: docsRaw } = await supabase
    .from("documentos")
    .select("id, nome, caminho_storage, substitui_id")
    .eq("cliente_id", clienteId)
    .order("enviado_em", { ascending: false })
    .limit(1000);
  const docs = agruparVersoes(
    (docsRaw ?? []).map((d) => ({
      id: d.id as string,
      substitui_id: (d.substitui_id as string | null) ?? null,
      nome: d.nome as string,
      caminho: d.caminho_storage as string,
    })),
  ).map((g) => g.atual);
  if (docs.length > TETO_DOCS) {
    return { erro: `Muitos documentos (${docs.length}). Baixe por partes na aba Documentos.` };
  }

  const { data: cfg } = await supabase
    .from("escritorio_config")
    .select("nome, cnpj, endereco")
    .eq("id", 1)
    .maybeSingle();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const html = sanitizarHtml(
    montarTermoHtml({
      tipo: "transferencia_saida",
      cliente: (cli.razao_social as string) ?? "—",
      marca: {
        nome: (cfg?.nome as string | null) ?? null,
        cnpj: (cfg?.cnpj as string | null) ?? null,
        enderecoLinha: formatarEnderecoLinha((cfg?.endereco as Record<string, string> | null) ?? null),
      },
      itens: ACERVO_PADRAO,
      arquivos: docs.map((d) => d.nome),
      data: hoje,
      responsavel: perfil.nome,
    }),
  );
  const pdf = await converterPdfHtml(html);
  if (!pdf) return { erro: "Conversão do termo para PDF indisponível no momento. Tente novamente." };

  const admin = createAdminSupabase();
  const zip = new PizZip();
  zip.file("termo-acervo.pdf", pdf);
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    const { data: blob } = await admin.storage.from("documentos").download(d.caminho);
    if (!blob) continue; // pula o que falhar; não aborta o pacote
    zip.file(`documentos/${nomeEntradaZip(d.nome, i)}`, Buffer.from(await blob.arrayBuffer()));
  }

  // Anexa o termo ao GED do cliente (trilha da devolução).
  const caminhoTermo = `${clienteId}/${crypto.randomUUID()}-termo-devolucao.pdf`;
  const up = await admin.storage.from("documentos").upload(caminhoTermo, pdf, { contentType: "application/pdf" });
  if (!up.error) {
    await admin.from("documentos").insert({
      cliente_id: clienteId,
      nome: "Termo de devolução de acervo — NBC PG 01",
      tipo: "legalização",
      caminho_storage: caminhoTermo,
      enviado_por: perfil.id,
    });
    revalidatePath(`/clientes/${clienteId}`);
  }

  const buf = zip.generate({ type: "nodebuffer" }) as Buffer;
  const nomeCli = (cli.razao_social as string).replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "cliente";
  return { zipBase64: buf.toString("base64"), nome: `acervo-${nomeCli}.zip` };
}
