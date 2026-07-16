"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { mesesDoPeriodo, type TipoPeriodo } from "@/lib/financeiro/orcado-realizado";
import { montarDRE, type CategoriaDRE, type DRE } from "@/lib/financeiro/dre";

const anoDe = (c: string) => Number(c.slice(0, 4));
const mesDe = (c: string) => Number(c.slice(5, 7));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function relatorioDRE(
  ano: number,
  tipo: TipoPeriodo,
  indice: number,
  base: "competencia" | "caixa",
): Promise<{ dre: DRE } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const { data: cats } = await supabase
    .from("categoria")
    .select("id, nome, natureza, grupo, ordem_dre")
    .eq("ativa", true);
  const categorias: CategoriaDRE[] = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA",
    grupo: c.grupo as "OPERACIONAL" | "NAO_OPERACIONAL",
    ordem_dre: c.ordem_dre as number,
  }));

  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const lanc: { categoriaId: string; ano: number; mes: number; valor: number }[] = [];
  if (base === "competencia") {
    const { data } = await supabase
      .from("titulo")
      .select("categoria_id, competencia, valor")
      .not("categoria_id", "is", null)
      .gte("competencia", ini)
      .lte("competencia", fim);
    for (const t of data ?? []) {
      const comp = t.competencia as string;
      lanc.push({ categoriaId: t.categoria_id as string, ano: anoDe(comp), mes: mesDe(comp), valor: Number(t.valor) });
    }
  } else {
    const { data } = await supabase
      .from("baixa")
      .select("valor_recebido, data_recebimento, estornada, titulo:titulo_id(categoria_id)")
      .eq("estornada", false)
      .gte("data_recebimento", ini)
      .lte("data_recebimento", fim);
    for (const b of data ?? []) {
      const tit = Array.isArray(b.titulo) ? b.titulo[0] : b.titulo;
      const cat = tit?.categoria_id as string | undefined;
      if (!cat) continue;
      const d = b.data_recebimento as string;
      lanc.push({ categoriaId: cat, ano: anoDe(d), mes: mesDe(d), valor: Number(b.valor_recebido) });
    }
  }

  const meses = mesesDoPeriodo(tipo, ano, indice);
  const chaves = new Set(meses.map((m) => `${m.ano}-${m.mes}`));
  const valorPorCategoria: Record<string, number> = {};
  for (const l of lanc) {
    if (!chaves.has(`${l.ano}-${l.mes}`)) continue;
    valorPorCategoria[l.categoriaId] = (valorPorCategoria[l.categoriaId] ?? 0) + l.valor;
  }

  return { dre: montarDRE(categorias, valorPorCategoria) };
}
