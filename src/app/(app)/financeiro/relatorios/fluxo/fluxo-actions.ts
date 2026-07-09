"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { montarFluxoCaixa, type CategoriaFC, type ItemFluxo, type FluxoCaixa } from "@/lib/financeiro/fluxo-caixa";

const mesDe = (d: string) => Number(d.slice(5, 7));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function relatorioFluxo(ano: number): Promise<{ fluxo: FluxoCaixa; mesAtual: number } | null> {
  if (!(await gate())) return null;
  const supabase = await createServerSupabase();
  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;

  const { data: cats } = await supabase.from("categoria").select("id, nome, natureza, ordem_dre").eq("ativa", true);
  const categorias: CategoriaFC[] = (cats ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    natureza: c.natureza as "RECEITA" | "DESPESA",
    ordem_dre: c.ordem_dre as number,
  }));

  const itens: ItemFluxo[] = [];

  // Realizado — baixas não estornadas do ano
  const { data: baixas } = await supabase
    .from("baixa")
    .select("valor_recebido, data_recebimento, titulo:titulo_id(tipo, categoria_id)")
    .eq("estornada", false)
    .gte("data_recebimento", ini)
    .lte("data_recebimento", fim);
  for (const b of baixas ?? []) {
    const tit = Array.isArray(b.titulo) ? b.titulo[0] : b.titulo;
    const cat = tit?.categoria_id as string | undefined;
    const tipo = tit?.tipo as "RECEBER" | "PAGAR" | undefined;
    if (!cat || !tipo) continue;
    itens.push({ categoriaId: cat, mes: mesDe(b.data_recebimento as string), tipo, valor: Number(b.valor_recebido) });
  }

  // Projetado — títulos em aberto por vencimento; saldo = valor − baixas não estornadas
  const { data: titulos } = await supabase
    .from("titulo")
    .select("categoria_id, tipo, valor, vencimento, status, baixa(valor_recebido, estornada)")
    .in("status", ["ABERTO", "VENCIDO", "BAIXADO_PARCIAL"])
    .not("categoria_id", "is", null)
    .gte("vencimento", ini)
    .lte("vencimento", fim);
  for (const t of titulos ?? []) {
    const cat = t.categoria_id as string | undefined;
    const tipo = t.tipo as "RECEBER" | "PAGAR" | undefined;
    if (!cat || !tipo) continue;
    const bxs = (Array.isArray(t.baixa) ? t.baixa : t.baixa ? [t.baixa] : []) as { valor_recebido: number; estornada: boolean }[];
    const baixado = bxs.filter((x) => !x.estornada).reduce((s, x) => s + Number(x.valor_recebido), 0);
    const saldo = Number(t.valor) - baixado;
    if (saldo <= 0) continue;
    itens.push({ categoriaId: cat, mes: mesDe(t.vencimento as string), tipo, valor: saldo });
  }

  const { data: contas } = await supabase.from("conta_bancaria").select("saldo_inicial").eq("ativa", true);
  const saldoInicial = (contas ?? []).reduce((s, c) => s + Number(c.saldo_inicial), 0);

  const fluxo = montarFluxoCaixa(categorias, itens, saldoInicial);

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = ano < anoAtual ? 0 : ano > anoAtual ? 13 : Number(hoje.slice(5, 7));

  return { fluxo, mesAtual };
}
