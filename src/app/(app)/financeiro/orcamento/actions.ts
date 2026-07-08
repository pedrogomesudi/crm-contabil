"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import type { CelulaOrcamento, MapaValores } from "@/lib/financeiro/orcamento";

export type CategoriaOrc = { id: string; nome: string; natureza: "RECEITA" | "DESPESA"; ordem_dre: number };

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}

export async function listarOrcamento(ano: number): Promise<{ categorias: CategoriaOrc[]; valores: MapaValores }> {
  if (!(await gate())) return { categorias: [], valores: {} };
  const supabase = await createServerSupabase();
  const { data: cats } = await supabase
    .from("categoria")
    .select("id, nome, natureza, ordem_dre")
    .eq("ativa", true)
    .order("natureza", { ascending: true }) // RECEITA antes de DESPESA (ordem do enum)
    .order("ordem_dre", { ascending: true });
  const { data: orc } = await supabase.from("orcamento").select("categoria_id, mes, valor").eq("ano", ano);
  const valores: MapaValores = {};
  for (const r of orc ?? []) {
    const cid = r.categoria_id as string;
    (valores[cid] ??= {})[r.mes as number] = Number(r.valor);
  }
  const categorias = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA",
    ordem_dre: c.ordem_dre as number,
  }));
  return { categorias, valores };
}

export async function salvarOrcamento(ano: number, celulas: CelulaOrcamento[]): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (celulas.length === 0) return { ok: true };
  const supabase = await createServerSupabase();
  const linhas = celulas.map((c) => ({
    categoria_id: c.categoriaId,
    ano,
    mes: c.mes,
    valor: c.valor,
    atualizado_em: new Date().toISOString(),
  }));
  const { error } = await supabase.from("orcamento").upsert(linhas, { onConflict: "categoria_id,ano,mes" });
  return error ? { erro: "Falha ao salvar." } : { ok: true };
}
