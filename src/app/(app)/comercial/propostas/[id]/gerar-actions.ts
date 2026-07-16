"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { obterProposta } from "../../propostas-actions";
import { montarMapaTags } from "@/lib/comercial/proposta-template";
import { gerarDocx, converterPdf, converterPdfHtml } from "@/lib/contrato/gerar";
import { renderHtml, sanitizarHtml } from "@/lib/comercial/gerar-proposta";

export async function gerarDocumentoProposta(
  id: string,
): Promise<{ erro?: string; modelo?: "padrao"; pdfBase64?: string; nome?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase
    .from("escritorio_config")
    .select("proposta_modelo, proposta_template_path, proposta_template_tipo, nome, cnpj, email, telefone, endereco")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg || cfg.proposta_modelo !== "proprio") return { modelo: "padrao" };
  if (!cfg.proposta_template_path) return { erro: "Nenhum modelo enviado. Envie um em Configurações → Marca." };

  const proposta = await obterProposta(id);
  if (!proposta) return { erro: "Proposta não encontrada." };

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { mapa, itens } = montarMapaTags({
    proposta: { numero: proposta.numero, validade: proposta.validade, observacoes: proposta.observacoes },
    cliente: { nome: proposta.prospectNome, contato: proposta.contatoNome },
    itens: proposta.itens.map((i) => ({ descricao: i.descricao, valor: i.valor, recorrencia: i.recorrencia })),
    marca: {
      nome: (cfg.nome as string | null) ?? null,
      cnpj: (cfg.cnpj as string | null) ?? null,
      email: (cfg.email as string | null) ?? null,
      telefone: (cfg.telefone as string | null) ?? null,
      endereco: (cfg.endereco as Record<string, string> | null) ?? null,
    },
    responsavel: proposta.responsavel,
    hoje,
  });

  const admin = createAdminSupabase();
  const { data: blob, error } = await admin.storage.from("documentos").download(cfg.proposta_template_path as string);
  if (error || !blob) return { erro: "Falha ao ler o modelo." };
  const bytes = Buffer.from(await blob.arrayBuffer());

  let pdf: Buffer | null;
  if (cfg.proposta_template_tipo === "docx") {
    pdf = await converterPdf(gerarDocx(bytes, mapa));
  } else {
    const html = sanitizarHtml(renderHtml(bytes.toString("utf8"), mapa, itens));
    pdf = await converterPdfHtml(html);
  }
  if (!pdf) return { erro: "Conversão para PDF indisponível no momento. Tente novamente." };
  return { pdfBase64: pdf.toString("base64"), nome: `proposta-${proposta.numero}.pdf` };
}
