"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { parcelas } from "@/lib/financeiro/parcelamento";

export type TituloPagar = {
  id: string;
  fornecedor: string;
  origem: string;
  descricao: string | null;
  competencia: string;
  vencimento: string;
  valor: number;
  somaBaixado: number;
  status: string;
};
export type Recorrente = {
  id: string;
  descricao: string;
  valor_mensal: number;
  dia_vencimento: number;
  ativa: boolean;
};
export type Anexo = { id: string; nome: string; caminho_storage: string };
const ROTA = "/financeiro/contas-a-pagar";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}

export async function listarTitulosPagar(competencia: string): Promise<TituloPagar[]> {
  if (!(await gate())) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("titulo")
    .select(
      "id, origem, descricao, competencia, vencimento, valor, status, fornecedor(nome), baixa(valor_recebido, estornada)",
    )
    .eq("tipo", "PAGAR")
    .eq("competencia", competencia)
    .order("vencimento");
  return (data ?? []).map((t) => {
    const forn = Array.isArray(t.fornecedor) ? t.fornecedor[0] : t.fornecedor;
    const baixas = (t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[];
    return {
      id: t.id as string,
      fornecedor: (forn as { nome?: string } | null)?.nome ?? "—",
      origem: t.origem as string,
      descricao: (t.descricao as string | null) ?? null,
      competencia: t.competencia as string,
      vencimento: t.vencimento as string,
      valor: Number(t.valor),
      somaBaixado: baixas.filter((b) => !b.estornada).reduce((s, b) => s + Number(b.valor_recebido), 0),
      status: t.status as string,
    };
  });
}

export async function lancarDespesa(fd: FormData) {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const modo = String(fd.get("modo") ?? "unica");
  const descricao = String(fd.get("descricao") ?? "").trim();
  const fornecedor_id = String(fd.get("fornecedor_id") ?? "").trim() || null;
  const categoria_id = String(fd.get("categoria_id") ?? "").trim() || null;
  const centro_custo_id = String(fd.get("centro_custo_id") ?? "").trim() || null;
  const valor = Number(fd.get("valor") ?? 0);
  const venc = String(fd.get("vencimento") ?? "").trim();
  const dia = Number(fd.get("dia_vencimento") ?? 0);
  if (!descricao || !(valor > 0) || !fornecedor_id) return { erro: "Preencha descrição, fornecedor e valor (>0)." };
  const supabase = await createServerSupabase();

  if (modo === "recorrente") {
    if (!(dia >= 1 && dia <= 28)) return { erro: "Dia de vencimento (1–28) obrigatório na recorrente." };
    const { error } = await supabase.from("despesa_recorrente").insert({
      descricao,
      fornecedor_id,
      categoria_id,
      centro_custo_id,
      valor_mensal: valor,
      dia_vencimento: dia,
      data_inicio: venc || new Date().toISOString().slice(0, 10),
      criado_por: perfil.id,
      atualizado_por: perfil.id,
    });
    if (error) return { erro: "Falha ao salvar a despesa recorrente." };
    revalidatePath(ROTA);
    return { ok: true };
  }

  if (!venc) return { erro: "Informe o vencimento." };
  const comp = `${venc.slice(0, 7)}-01`;
  const n = modo === "parcelada" ? Math.max(2, Number(fd.get("total_parcelas") ?? 2)) : 1;
  const grupo = n > 1 ? crypto.randomUUID() : null;
  const lista = n > 1 ? parcelas(valor, n, venc, comp) : [{ parcela: 1, valor, vencimento: venc, competencia: comp }];
  const rows = lista.map((p) => ({
    tipo: "PAGAR" as const,
    fornecedor_id,
    origem: n > 1 ? "DESPESA_PARCELADA" : "DESPESA_AVULSA",
    descricao: n > 1 ? `${descricao} (${p.parcela}/${n})` : descricao,
    valor: p.valor,
    competencia: p.competencia,
    vencimento: p.vencimento,
    categoria_id,
    centro_custo_id,
    parcela: n > 1 ? p.parcela : null,
    total_parcelas: n > 1 ? n : null,
    grupo_parcelamento_id: grupo,
    criado_por: perfil.id,
    atualizado_por: perfil.id,
  }));
  const { error } = await supabase.from("titulo").insert(rows);
  if (error) return { erro: "Falha ao lançar a despesa." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function gerarDespesasRecorrentes(competencia: string) {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Competência inválida." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gerar_despesas_recorrentes", { p_competencia: competencia });
  if (error) return { erro: "Falha na geração." };
  const r = data as { gerados?: number; pulados?: number } | null;
  revalidatePath(ROTA);
  return { gerados: r?.gerados ?? 0, pulados: r?.pulados ?? 0 };
}

export async function registrarPagamento(fd: FormData) {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const tituloId = String(fd.get("titulo_id") ?? "");
  const valor = Number(fd.get("valor_recebido") ?? 0);
  const conta = String(fd.get("conta_bancaria_id") ?? "");
  const forma = String(fd.get("forma_pagamento") ?? "");
  const data = String(fd.get("data_recebimento") ?? "");
  if (!tituloId || !(valor > 0) || !conta || !forma || !data) return { erro: "Preencha valor, data, conta e forma." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("baixa").insert({
    titulo_id: tituloId,
    data_recebimento: data,
    valor_recebido: valor,
    juros: Number(fd.get("juros") ?? 0) || 0,
    multa: Number(fd.get("multa") ?? 0) || 0,
    desconto: Number(fd.get("desconto") ?? 0) || 0,
    conta_bancaria_id: conta,
    forma_pagamento: forma,
    criado_por: perfil.id,
  });
  if (error) return { erro: "Falha ao registrar o pagamento." };
  revalidatePath(ROTA);
  return { ok: true };
}

// Estorna a baixa não-estornada de um título (com justificativa). Marca, não deleta.
export async function estornarBaixaDoTitulo(tituloId: string, motivo: string) {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!motivo || motivo.trim().length < 3) return { erro: "Informe a justificativa do estorno." };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("baixa")
    .update({
      estornada: true,
      estorno_motivo: motivo.trim(),
      estorno_em: new Date().toISOString(),
      estorno_por: perfil.id,
    })
    .eq("titulo_id", tituloId)
    .eq("estornada", false);
  if (error) return { erro: "Falha ao estornar." };
  revalidatePath(ROTA);
  revalidatePath("/financeiro/contas-a-receber");
  return { ok: true };
}

export async function anexar(fd: FormData) {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const tituloId = String(fd.get("titulo_id") ?? "");
  const file = fd.get("arquivo") as File | null;
  if (!tituloId || !file || file.size === 0) return { erro: "Selecione o arquivo." };
  const nomeSeguro = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const caminho = `anexos-financeiro/${tituloId}/${crypto.randomUUID()}-${nomeSeguro}`;
  const admin = createAdminSupabase();
  const up = await admin.storage.from("documentos").upload(caminho, file, { contentType: file.type });
  if (up.error) return { erro: "Falha no upload." };
  const { error } = await admin
    .from("anexo_titulo")
    .insert({ titulo_id: tituloId, nome: file.name, caminho_storage: caminho, criado_por: perfil.id });
  if (error) {
    await admin.storage.from("documentos").remove([caminho]);
    return { erro: "Falha ao registrar o anexo." };
  }
  revalidatePath(ROTA);
  return { ok: true };
}

export async function listarAnexos(tituloId: string): Promise<Anexo[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("anexo_titulo")
    .select("id, nome, caminho_storage")
    .eq("titulo_id", tituloId)
    .order("criado_em");
  return (data ?? []) as Anexo[];
}
