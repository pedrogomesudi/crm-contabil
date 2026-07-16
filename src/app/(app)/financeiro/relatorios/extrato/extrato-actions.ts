"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";

export type TipoFiltro = "todos" | "RECEBER" | "PAGAR";
export type LancamentoRow = {
  id: string;
  cliente: string;
  tipo: string;
  descricao: string;
  categoria: string;
  competencia: string;
  vencimento: string;
  valor: number;
  baixado: number;
  status: string;
};
export type BaixaRow = {
  id: string;
  data: string;
  cliente: string;
  tipo: string;
  valor: number;
  forma: string;
  conta: string;
  descricao: string;
};

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listarCategoriasFiltro(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("categoria").select("id, nome").eq("ativa", true).order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}

export async function listarLancamentos(
  inicio: string,
  fim: string,
  tipo: TipoFiltro,
  categoriaId: string | null,
): Promise<LancamentoRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  let q = supabase
    .from("titulo")
    .select("id, tipo, descricao, competencia, vencimento, valor, status, clientes(razao_social), categoria(nome)")
    .gte("vencimento", inicio)
    .lte("vencimento", fim)
    .order("vencimento");
  if (tipo !== "todos") q = q.eq("tipo", tipo);
  if (categoriaId) q = q.eq("categoria_id", categoriaId);
  const { data } = await q;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as string);
  const baixadoPor = new Map<string, number>();
  if (ids.length) {
    const { data: bs } = await supabase
      .from("baixa")
      .select("titulo_id, valor_recebido")
      .in("titulo_id", ids)
      .eq("estornada", false);
    for (const b of bs ?? [])
      baixadoPor.set(b.titulo_id as string, (baixadoPor.get(b.titulo_id as string) ?? 0) + Number(b.valor_recebido));
  }
  return rows.map((r) => {
    const cli = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const cat = um(r.categoria as { nome?: string } | { nome?: string }[] | null);
    return {
      id: r.id as string,
      cliente: (cli?.razao_social as string) ?? "—",
      tipo: r.tipo as string,
      descricao: (r.descricao as string | null) ?? "",
      categoria: (cat?.nome as string) ?? "—",
      competencia: r.competencia as string,
      vencimento: r.vencimento as string,
      valor: Number(r.valor),
      baixado: baixadoPor.get(r.id as string) ?? 0,
      status: r.status as string,
    };
  });
}

export async function listarBaixas(inicio: string, fim: string, tipo: TipoFiltro): Promise<BaixaRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("baixa")
    .select(
      "id, data_recebimento, valor_recebido, forma_pagamento, conta:conta_bancaria_id(nome), titulo:titulo_id(tipo, descricao, clientes(razao_social))",
    )
    .eq("estornada", false)
    .gte("data_recebimento", inicio)
    .lte("data_recebimento", fim)
    .order("data_recebimento");
  const rows = data ?? [];
  const out: BaixaRow[] = [];
  for (const b of rows) {
    const tit = um(
      b.titulo as
        | { tipo?: string; descricao?: string; clientes?: unknown }
        | Array<{ tipo?: string; descricao?: string; clientes?: unknown }>
        | null,
    );
    if (tipo !== "todos" && tit?.tipo !== tipo) continue;
    const cli = um(tit?.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const conta = um(b.conta as { nome?: string } | { nome?: string }[] | null);
    out.push({
      id: b.id as string,
      data: b.data_recebimento as string,
      cliente: (cli?.razao_social as string) ?? "—",
      tipo: (tit?.tipo as string) ?? "",
      valor: Number(b.valor_recebido),
      forma: b.forma_pagamento as string,
      conta: (conta?.nome as string) ?? "—",
      descricao: (tit?.descricao as string) ?? "",
    });
  }
  return out;
}
