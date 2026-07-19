"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { totaisProposta, type ItemRecorrencia } from "@/lib/comercial/proposta";
import type { SnapshotPreco } from "@/lib/comercial/precificacao";

export type PropostaStatus = "rascunho" | "enviada" | "aceita" | "recusada";
export type PropostaItemView = {
  id: string;
  descricao: string;
  valor: number;
  recorrencia: ItemRecorrencia;
  ordem: number;
};
export type PropostaResumo = {
  id: string;
  numero: number;
  status: PropostaStatus;
  validade: string | null;
  totalMensal: number;
  totalUnico: number;
};
export type Pagamento = {
  pixChave: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  titular: string | null;
  documento: string | null;
};
export type Responsavel = { nome: string | null; email: string | null; telefone: string | null };
export type PropostaView = {
  id: string;
  numero: number;
  status: PropostaStatus;
  validade: string | null;
  observacoes: string | null;
  oportunidadeId: string;
  prospectNome: string;
  contatoNome: string | null;
  itens: PropostaItemView[];
  pagamento: Pagamento;
  responsavel: Responsavel;
  precificacao: SnapshotPreco | null;
};
export type ItemInput = { descricao: string; valor: number; recorrencia: ItemRecorrencia };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

export async function listarPropostas(oportunidadeId: string): Promise<PropostaResumo[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data: props } = await supabase
    .from("proposta")
    .select("id, numero, status, validade")
    .eq("oportunidade_id", oportunidadeId)
    .order("numero", { ascending: false });
  const rows = props ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const { data: itens } = await supabase
    .from("proposta_item")
    .select("proposta_id, valor, recorrencia")
    .in("proposta_id", ids);
  const porProp = new Map<string, { valor: number; recorrencia: ItemRecorrencia }[]>();
  for (const it of itens ?? []) {
    const a = porProp.get(it.proposta_id as string) ?? [];
    a.push({ valor: Number(it.valor), recorrencia: it.recorrencia as ItemRecorrencia });
    porProp.set(it.proposta_id as string, a);
  }
  return rows.map((r) => {
    const t = totaisProposta(porProp.get(r.id as string) ?? []);
    return {
      id: r.id as string,
      numero: Number(r.numero),
      status: r.status as PropostaStatus,
      validade: (r.validade as string | null) ?? null,
      totalMensal: t.mensal,
      totalUnico: t.unico,
    };
  });
}

export async function obterProposta(id: string): Promise<PropostaView | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const { data: pr } = await supabase
    .from("proposta")
    .select(
      "id, numero, status, validade, observacoes, oportunidade_id, responsavel_nome, responsavel_email, responsavel_telefone, precificacao",
    )
    .eq("id", id)
    .maybeSingle();
  if (!pr) return null;
  const { data: itens } = await supabase
    .from("proposta_item")
    .select("id, descricao, valor, recorrencia, ordem")
    .eq("proposta_id", id)
    .order("ordem");
  const { data: op } = await supabase
    .from("oportunidade")
    .select("prospect_nome, contato_nome")
    .eq("id", pr.oportunidade_id as string)
    .maybeSingle();
  const { data: db } = await supabase
    .from("dados_bancarios")
    .select("pix_chave, banco, agencia, conta, titular, documento")
    .eq("id", 1)
    .maybeSingle();
  return {
    id: pr.id as string,
    numero: Number(pr.numero),
    status: pr.status as PropostaStatus,
    validade: (pr.validade as string | null) ?? null,
    observacoes: (pr.observacoes as string | null) ?? null,
    oportunidadeId: pr.oportunidade_id as string,
    prospectNome: (op?.prospect_nome as string) ?? "—",
    contatoNome: (op?.contato_nome as string | null) ?? null,
    itens: (itens ?? []).map((i) => ({
      id: i.id as string,
      descricao: i.descricao as string,
      valor: Number(i.valor),
      recorrencia: i.recorrencia as ItemRecorrencia,
      ordem: i.ordem as number,
    })),
    pagamento: {
      pixChave: (db?.pix_chave as string | null) ?? null,
      banco: (db?.banco as string | null) ?? null,
      agencia: (db?.agencia as string | null) ?? null,
      conta: (db?.conta as string | null) ?? null,
      titular: (db?.titular as string | null) ?? null,
      documento: (db?.documento as string | null) ?? null,
    },
    responsavel: {
      nome: (pr.responsavel_nome as string | null) ?? null,
      email: (pr.responsavel_email as string | null) ?? null,
      telefone: (pr.responsavel_telefone as string | null) ?? null,
    },
    precificacao: (pr.precificacao as SnapshotPreco | null) ?? null,
  };
}

export type PropostaGlobal = PropostaResumo & { oportunidadeId: string; prospectNome: string };

export async function listarTodasPropostas(): Promise<PropostaGlobal[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data: props } = await supabase
    .from("proposta")
    .select("id, numero, status, validade, oportunidade_id")
    .order("numero", { ascending: false });
  const rows = props ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const opIds = [...new Set(rows.map((r) => r.oportunidade_id as string))];
  const { data: itens } = await supabase
    .from("proposta_item")
    .select("proposta_id, valor, recorrencia")
    .in("proposta_id", ids);
  const { data: ops } = await supabase.from("oportunidade").select("id, prospect_nome").in("id", opIds);
  const nomePorOp = new Map<string, string>(
    (ops ?? []).map((o) => [o.id as string, (o.prospect_nome as string) ?? "—"]),
  );
  const porProp = new Map<string, { valor: number; recorrencia: ItemRecorrencia }[]>();
  for (const it of itens ?? []) {
    const a = porProp.get(it.proposta_id as string) ?? [];
    a.push({ valor: Number(it.valor), recorrencia: it.recorrencia as ItemRecorrencia });
    porProp.set(it.proposta_id as string, a);
  }
  return rows.map((r) => {
    const t = totaisProposta(porProp.get(r.id as string) ?? []);
    return {
      id: r.id as string,
      numero: Number(r.numero),
      status: r.status as PropostaStatus,
      validade: (r.validade as string | null) ?? null,
      totalMensal: t.mensal,
      totalUnico: t.unico,
      oportunidadeId: r.oportunidade_id as string,
      prospectNome: nomePorOp.get(r.oportunidade_id as string) ?? "—",
    };
  });
}

export async function criarProposta(oportunidadeId: string): Promise<{ id?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("proposta")
    .insert({ oportunidade_id: oportunidadeId })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao criar." };
  return { id: data.id as string };
}

export async function salvarProposta(
  id: string,
  dados: {
    validade: string | null;
    observacoes: string | null;
    itens: ItemInput[];
    responsavel: Responsavel;
    precificacao?: unknown;
  },
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = {
    validade: dados.validade,
    observacoes: dados.observacoes,
    responsavel_nome: dados.responsavel.nome,
    responsavel_email: dados.responsavel.email,
    responsavel_telefone: dados.responsavel.telefone,
    atualizado_em: new Date().toISOString(),
  };
  // Só grava o snapshot quando vier — um save normal não apaga o snapshot existente.
  if (dados.precificacao !== undefined) patch.precificacao = dados.precificacao;
  const { error: e1 } = await supabase.from("proposta").update(patch).eq("id", id);
  if (e1) return { erro: "Falha ao salvar." };
  await supabase.from("proposta_item").delete().eq("proposta_id", id);
  const linhas = dados.itens
    .filter((i) => i.descricao.trim())
    .map((i, idx) => ({
      proposta_id: id,
      descricao: i.descricao.trim(),
      valor: i.valor,
      recorrencia: i.recorrencia,
      ordem: idx,
    }));
  if (linhas.length > 0) {
    const { error: e2 } = await supabase.from("proposta_item").insert(linhas);
    if (e2) return { erro: "Falha ao salvar itens." };
  }
  revalidatePath(`/comercial/propostas/${id}`);
  return { ok: true };
}

export async function definirStatusProposta(
  id: string,
  status: PropostaStatus,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: pr } = await supabase.from("proposta").select("oportunidade_id").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("proposta")
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar status." };
  if (pr) {
    const opId = pr.oportunidade_id as string;
    if (status === "aceita") {
      await supabase
        .from("oportunidade")
        .update({ etapa: "ganho", fechado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
        .eq("id", opId);
    } else if (status === "enviada") {
      const { data: op } = await supabase.from("oportunidade").select("etapa").eq("id", opId).maybeSingle();
      if (op && (op.etapa === "novo" || op.etapa === "contato")) {
        await supabase
          .from("oportunidade")
          .update({ etapa: "proposta", atualizado_em: new Date().toISOString() })
          .eq("id", opId);
      }
    }
  }
  revalidatePath(`/comercial/propostas/${id}`);
  revalidatePath("/comercial");
  return { ok: true };
}

export async function excluirProposta(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: pr } = await supabase.from("proposta").select("oportunidade_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("proposta").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  if (pr) revalidatePath(`/comercial/propostas?op=${pr.oportunidade_id as string}`);
  return { ok: true };
}
