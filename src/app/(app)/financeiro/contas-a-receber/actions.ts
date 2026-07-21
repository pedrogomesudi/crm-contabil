"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { criarTituloAvulsoNucleo } from "@/lib/financeiro/gravar-titulo";
import { emitirBoleto } from "./boleto-actions";

export type TituloView = {
  id: string;
  cliente: string;
  origem: string;
  competencia: string;
  vencimento: string;
  valor: number;
  somaBaixado: number;
  status: string;
  temTelefone: boolean;
};
const ROTA = "/financeiro/contas-a-receber";

async function gateVer() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}
async function gateGerir() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}

export async function listarTitulos(competencia: string): Promise<TituloView[]> {
  if (!(await gateVer())) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("titulo")
    .select(
      "id, origem, competencia, vencimento, valor, status, clientes(razao_social, telefone), baixa(valor_recebido, estornada)",
    )
    .eq("competencia", competencia)
    .order("vencimento");
  return (data ?? []).map((t) => {
    const cl = Array.isArray(t.clientes) ? t.clientes[0] : t.clientes;
    const cliente = cl as { razao_social?: string; telefone?: string } | null;
    const baixas = (t.baixa ?? []) as { valor_recebido: number; estornada: boolean }[];
    return {
      id: t.id as string,
      cliente: cliente?.razao_social ?? "—",
      origem: t.origem as string,
      competencia: t.competencia as string,
      vencimento: t.vencimento as string,
      valor: Number(t.valor),
      somaBaixado: baixas.filter((b) => !b.estornada).reduce((s, b) => s + Number(b.valor_recebido), 0),
      status: t.status as string,
      temTelefone: Boolean(cliente?.telefone),
    };
  });
}

export async function listarClientesAtivos(): Promise<{ id: string; nome: string }[]> {
  if (!(await gateGerir())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .is("excluido_em", null)
    .order("razao_social");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }));
}

export async function listarCategoriasReceita(): Promise<{ id: string; nome: string }[]> {
  if (!(await gateGerir())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("categoria")
    .select("id, nome, natureza")
    .eq("ativa", true)
    .eq("natureza", "RECEITA")
    .order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}

export type ResultadoAvulsa = { ok: true; tituloId: string; avisoBoleto?: string } | { erro: string };

export async function criarCobrancaAvulsa(
  input: { clienteId: string; valor: number; vencimento: string; categoriaId: string; descricao: string },
  emitirBoletoAgora: boolean,
): Promise<ResultadoAvulsa> {
  const perfil = await gateGerir();
  if (!perfil) return { erro: "Sem permissão." };
  const r = await criarTituloAvulsoNucleo(input, { db: await createServerSupabase(), autorId: perfil.id });
  if (!r.ok) return { erro: r.erro };
  const tituloId = r.tituloId;
  revalidatePath(ROTA);
  if (emitirBoletoAgora) {
    const b = await emitirBoleto(tituloId);
    if (b.erro) return { ok: true, tituloId, avisoBoleto: b.erro };
  }
  return { ok: true, tituloId };
}

export async function gerarMensalidades(competencia: string) {
  if (!(await gateGerir())) return { erro: "Sem permissão." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Competência inválida." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gerar_mensalidades", { p_competencia: competencia });
  if (error) return { erro: "Falha na geração." };
  const r = data as { gerados?: number; pulados?: number } | null;
  revalidatePath(ROTA);
  return { gerados: r?.gerados ?? 0, pulados: r?.pulados ?? 0 };
}

export async function registrarBaixa(fd: FormData) {
  const perfil = await gateGerir();
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
  if (error) return { erro: "Falha ao registrar a baixa." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function lerAutomacao(): Promise<boolean> {
  if (!(await gateVer())) return false;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("financeiro_config").select("geracao_automatica").eq("id", 1).maybeSingle();
  return Boolean(data?.geracao_automatica);
}

export async function setAutomacao(ativa: boolean): Promise<void> {
  const perfil = await gateGerir();
  if (!perfil) return;
  const supabase = await createServerSupabase();
  await supabase
    .from("financeiro_config")
    .update({ geracao_automatica: ativa, atualizado_em: new Date().toISOString(), atualizado_por: perfil.id })
    .eq("id", 1);
  revalidatePath(ROTA);
}
