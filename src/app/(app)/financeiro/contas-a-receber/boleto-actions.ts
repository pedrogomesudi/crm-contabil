"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { adaptadorAtivo } from "@/lib/boleto/ativo";
import { dadosEmissaoDeTitulo } from "@/lib/boleto/emissao";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { garantirPdfBoleto, assinarPdfBoleto } from "./boleto-pdf";
import { sincronizarBoletosCore } from "./sincronizar";
import { cancelarBoletoNoInter } from "@/lib/boleto/cancelar-exec";
import { podeCancelarTitulo } from "@/lib/boleto/cancelamento";
import { validarNovaVencimento } from "@/lib/boleto/vencimento";

export type BoletoView = {
  id: string;
  numero: number;
  vencimento: string;
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

// Núcleo de emissão reutilizável: recebe o título já carregado + a data de vencimento a usar
// (a do próprio título na emissão normal; a nova data na alteração de vencimento). Carrega o
// cliente, pega o próximo número, emite no provedor ativo e grava a linha `boleto`. NÃO faz gate
// nem checagem de duplicidade — isso é responsabilidade de quem chama.
async function emitirBoletoNucleo(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  titulo: { id: string; valor: number; descricao: string | null; cliente_id: string },
  vencimento: string,
): Promise<{ ok?: true; erro?: string }> {
  const { data: c } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, email, endereco")
    .eq("id", titulo.cliente_id)
    .maybeSingle();
  if (!c) return { erro: "Cliente não encontrado." };
  const ativo = await adaptadorAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const { data: n } = await supabase.rpc("proximo_numero_boleto");
  const numero = Number(n);
  const dados = dadosEmissaoDeTitulo(
    { valor: Number(titulo.valor), vencimento, descricao: titulo.descricao },
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
    titulo_id: titulo.id,
    numero,
    provedor: ativo.provedor,
    provedor_boleto_id: emitido.provedorBoletoId,
    nosso_numero: emitido.nossoNumero,
    linha_digitavel: emitido.linhaDigitavel,
    pix_copia_cola: emitido.pixCopiaCola,
    url_pdf: emitido.urlPdf,
    valor: titulo.valor,
    vencimento,
  });
  if (error) return { erro: "Boleto emitido no provedor, mas falhou ao gravar. Verifique antes de reemitir." };
  return { ok: true };
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
  const r = await emitirBoletoNucleo(
    supabase,
    {
      id: t.id as string,
      valor: Number(t.valor),
      descricao: (t.descricao as string | null) ?? null,
      cliente_id: t.cliente_id as string,
    },
    t.vencimento as string,
  );
  if (r.erro) return r;
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
    .select("id, titulo_id, numero, provedor, vencimento, linha_digitavel, pix_copia_cola, url_pdf, status")
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
      vencimento: b.vencimento as string,
      provedor: b.provedor as string,
      linhaDigitavel: (b.linha_digitavel as string | null) ?? null,
      pixCopiaCola: (b.pix_copia_cola as string | null) ?? null,
      urlPdf: (b.url_pdf as string | null) ?? null,
      status: b.status as string,
    };
  }
  return mapa;
}

export async function sincronizarBoletosInter(): Promise<{ baixados?: number; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  try {
    const r = await sincronizarBoletosCore();
    revalidatePath("/financeiro/contas-a-receber");
    return { baixados: r.baixados };
  } catch (e) {
    return { erro: `Falha na sincronização: ${(e as Error).message}` };
  }
}

export async function cancelarBoleto(boletoId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!motivo || motivo.trim().length < 3) return { erro: "Informe a justificativa do cancelamento." };
  const admin = createAdminSupabase();
  const { data: b } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, status")
    .eq("id", boletoId)
    .maybeSingle();
  if (!b) return { erro: "Boleto não encontrado." };
  if (b.status !== "emitido") return { erro: "Só é possível cancelar boleto emitido." };
  try {
    await cancelarBoletoNoInter(
      admin,
      {
        id: b.id as string,
        provedor: b.provedor as string,
        provedor_boleto_id: (b.provedor_boleto_id as string | null) ?? null,
        status: b.status as string,
      },
      motivo.trim(),
    );
  } catch (e) {
    return { erro: `Falha ao cancelar no provedor: ${(e as Error).message}` };
  }
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}

export async function cancelarTitulo(tituloId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!motivo || motivo.trim().length < 3) return { erro: "Informe a justificativa do cancelamento." };
  const admin = createAdminSupabase();
  const { data: t } = await admin
    .from("titulo")
    .select("id, status, baixa(valor_recebido, estornada)")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  const somaBaixado = ((t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[])
    .filter((x) => !x.estornada)
    .reduce((s, x) => s + Number(x.valor_recebido), 0);
  if (!podeCancelarTitulo(t.status as string, somaBaixado))
    return { erro: "Título não pode ser cancelado (baixado, pago ou já cancelado)." };
  const { data: bol } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, status")
    .eq("titulo_id", tituloId)
    .eq("status", "emitido")
    .maybeSingle();
  if (bol) {
    try {
      await cancelarBoletoNoInter(
        admin,
        {
          id: bol.id as string,
          provedor: bol.provedor as string,
          provedor_boleto_id: (bol.provedor_boleto_id as string | null) ?? null,
          status: bol.status as string,
        },
        motivo.trim(),
      );
    } catch (e) {
      return { erro: `Falha ao cancelar o boleto no provedor: ${(e as Error).message}` };
    }
  }
  await admin.from("titulo").update({ status: "CANCELADO" }).eq("id", tituloId);
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}

// Reagenda o vencimento de um título em aberto e, se houver boleto ativo, reemite-o com a nova
// data (cancela → reemite). Só o título muda de data; o boleto acompanha. Se a reemissão falhar
// após o título já ter sido reagendado, reporta e deixa retryável via "Emitir boleto".
export async function alterarVencimentoTitulo(
  tituloId: string,
  novaData: string,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  const { data: t } = await admin
    .from("titulo")
    .select("id, valor, descricao, status, cliente_id, vencimento, baixa(valor_recebido, estornada)")
    .eq("id", tituloId)
    .maybeSingle();
  if (!t) return { erro: "Título não encontrado." };
  const somaBaixado = ((t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[])
    .filter((x) => !x.estornada)
    .reduce((s, x) => s + Number(x.valor_recebido), 0);
  if (!podeCancelarTitulo(t.status as string, somaBaixado))
    return { erro: "Só é possível reagendar título em aberto (sem baixa)." };

  const hojeISO = new Date().toISOString().slice(0, 10);
  const val = validarNovaVencimento(novaData, t.vencimento as string, hojeISO);
  if ("erro" in val) return { erro: val.erro };

  const { error: errUpd } = await admin.from("titulo").update({ vencimento: novaData }).eq("id", tituloId);
  if (errUpd) return { erro: "Falha ao reagendar o título." };

  // Se houver boleto ativo, reemite com a nova data (cancela → reemite).
  const { data: bol } = await admin
    .from("boleto")
    .select("id, provedor, provedor_boleto_id, status")
    .eq("titulo_id", tituloId)
    .eq("status", "emitido")
    .maybeSingle();
  if (bol) {
    const motivo = `Alteração de vencimento para ${novaData.slice(8, 10)}/${novaData.slice(5, 7)}/${novaData.slice(0, 4)}`;
    try {
      await cancelarBoletoNoInter(
        admin,
        {
          id: bol.id as string,
          provedor: bol.provedor as string,
          provedor_boleto_id: (bol.provedor_boleto_id as string | null) ?? null,
          status: bol.status as string,
        },
        motivo,
      );
    } catch (e) {
      return {
        erro: `Vencimento alterado, mas falhou ao cancelar o boleto: ${(e as Error).message} Use "Emitir boleto".`,
      };
    }
    const r = await emitirBoletoNucleo(
      supabase,
      {
        id: t.id as string,
        valor: Number(t.valor),
        descricao: (t.descricao as string | null) ?? null,
        cliente_id: t.cliente_id as string,
      },
      novaData,
    );
    if (r.erro) {
      return {
        erro: `Vencimento alterado, mas a reemissão do boleto falhou: ${r.erro} Use "Emitir boleto" para gerar novamente.`,
      };
    }
  }
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}
