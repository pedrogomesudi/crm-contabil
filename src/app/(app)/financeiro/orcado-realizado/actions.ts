"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import {
  mesesDoPeriodo,
  montarComparativo,
  type TipoPeriodo,
  type CategoriaRef,
  type LancRealizado,
  type Comparativo,
} from "@/lib/financeiro/orcado-realizado";
import type { MapaValores } from "@/lib/financeiro/orcamento";

export type BaseRegime = "competencia" | "caixa";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}

const anoDe = (iso: string) => Number(iso.slice(0, 4));
const mesDe = (iso: string) => Number(iso.slice(5, 7));

export async function dashboardOrcadoRealizado(
  ano: number,
  tipo: TipoPeriodo,
  indice: number,
  base: BaseRegime,
): Promise<{ categorias: CategoriaRef[]; comparativo: Comparativo } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();

  const { data: cats } = await supabase.from("categoria").select("id, nome, natureza, ordem_dre").eq("ativa", true);
  const categorias: CategoriaRef[] = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA",
    ordem_dre: c.ordem_dre as number,
  }));

  const { data: orc } = await supabase.from("orcamento").select("categoria_id, mes, valor").eq("ano", ano);
  const orcamento: MapaValores = {};
  for (const r of orc ?? []) (orcamento[r.categoria_id as string] ??= {})[r.mes as number] = Number(r.valor);

  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const realizado: LancRealizado[] = [];
  if (base === "competencia") {
    const { data } = await supabase
      .from("titulo")
      .select("categoria_id, competencia, valor")
      .not("categoria_id", "is", null)
      .gte("competencia", ini)
      .lte("competencia", fim);
    for (const t of data ?? []) {
      const comp = t.competencia as string;
      realizado.push({
        categoriaId: t.categoria_id as string,
        ano: anoDe(comp),
        mes: mesDe(comp),
        valor: Number(t.valor),
      });
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
      realizado.push({ categoriaId: cat, ano: anoDe(d), mes: mesDe(d), valor: Number(b.valor_recebido) });
    }
  }

  const meses = mesesDoPeriodo(tipo, ano, indice);
  return { categorias, comparativo: montarComparativo(categorias, orcamento, realizado, meses, ano) };
}
