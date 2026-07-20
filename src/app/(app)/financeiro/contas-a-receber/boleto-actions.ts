"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { dadosEmissaoDeTitulo } from "@/lib/boleto/emissao";
import { garantirPdfBoleto, assinarPdfBoleto } from "./boleto-pdf";

export type BoletoView = {
  id: string;
  numero: number;
  provedor: string;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  urlPdf: string | null;
  status: string;
};

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function emitirBoleto(tituloId: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: t } = await supabase
    .from("titulo")
    .select("id, valor, vencimento, descricao, status, cliente_id")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  if (t.status !== "ABERTO" && t.status !== "VENCIDO") return { erro: "Título não está em aberto." };
  const { data: existente } = await supabase
    .from("boleto")
    .select("id")
    .eq("titulo_id", tituloId)
    .not("status", "in", "(cancelado,erro)")
    .maybeSingle();
  if (existente) return { erro: "Já existe boleto para este título." };
  const { data: c } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, email, endereco")
    .eq("id", t.cliente_id as string)
    .maybeSingle();
  if (!c) return { erro: "Cliente não encontrado." };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const { data: n } = await supabase.rpc("proximo_numero_boleto");
  const numero = Number(n);
  const dados = dadosEmissaoDeTitulo(
    { valor: Number(t.valor), vencimento: t.vencimento as string, descricao: (t.descricao as string | null) ?? null },
    {
      razaoSocial: c.razao_social as string,
      cpfCnpj: (c.cpf_cnpj as string) ?? "",
      email: (c.email as string | null) ?? null,
      endereco: (c.endereco as Record<string, string> | null) ?? null,
    },
    numero,
  );
  let emitido;
  try {
    emitido = await ativo.adaptador.emitir(dados);
  } catch (e) {
    return { erro: `Falha na emissão: ${(e as Error).message}` };
  }
  const { error } = await supabase.from("boleto").insert({
    titulo_id: tituloId,
    numero,
    provedor: ativo.provedor,
    provedor_boleto_id: emitido.provedorBoletoId,
    nosso_numero: emitido.nossoNumero,
    linha_digitavel: emitido.linhaDigitavel,
    pix_copia_cola: emitido.pixCopiaCola,
    url_pdf: emitido.urlPdf,
    valor: t.valor,
    vencimento: t.vencimento,
  });
  if (error) return { erro: "Boleto emitido no provedor, mas falhou ao gravar. Verifique antes de reemitir." };
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}

export async function urlBoletoPdfEquipe(boletoId: string): Promise<{ url?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: b } = await supabase.from("boleto").select("id, numero, url_pdf").eq("id", boletoId).maybeSingle();
  if (!b) return { erro: "Boleto não encontrado." };
  if (b.url_pdf) return { url: b.url_pdf as string };
  const caminho = await garantirPdfBoleto(boletoId);
  if (!caminho) return { erro: "PDF não disponível para este boleto." };
  const url = await assinarPdfBoleto(caminho, Number(b.numero));
  if (!url) return { erro: "Falha ao gerar o PDF." };
  return { url };
}

export async function listarBoletosDaCompetencia(competencia: string): Promise<Record<string, BoletoView>> {
  if (!(await gate())) return {};
  const supabase = await createServerSupabase();
  const { data: titulos } = await supabase.from("titulo").select("id").eq("competencia", competencia);
  const ids = (titulos ?? []).map((t) => t.id as string);
  if (ids.length === 0) return {};
  const { data: bs } = await supabase
    .from("boleto")
    .select("id, titulo_id, numero, provedor, linha_digitavel, pix_copia_cola, url_pdf, status")
    .in("titulo_id", ids)
    .neq("status", "cancelado")
    .order("criado_em", { ascending: false });
  const mapa: Record<string, BoletoView> = {};
  for (const b of bs ?? []) {
    const tid = b.titulo_id as string;
    if (mapa[tid]) continue;
    mapa[tid] = {
      id: b.id as string,
      numero: Number(b.numero),
      provedor: b.provedor as string,
      linhaDigitavel: (b.linha_digitavel as string | null) ?? null,
      pixCopiaCola: (b.pix_copia_cola as string | null) ?? null,
      urlPdf: (b.url_pdf as string | null) ?? null,
      status: b.status as string,
    };
  }
  return mapa;
}
