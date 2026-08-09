"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { exportar } from "@/app/(app)/exportar/actions";
import { formatarData } from "@/lib/format";
import type { ArquivoExportado, FormatoExportacao, RelatorioExportavel } from "@/lib/exportar/tipos";

export type TipoConta = "RECEBER" | "PAGAR";
export type ContaRow = { nome: string; valor: number; vencimento: string };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// "Contas a receber/a pagar" = títulos ainda devidos com vencimento no período:
// ABERTO ou baixa parcial. Quitado (BAIXADO) e cancelado ficam de fora — não são
// mais uma conta em aberto. O nome sai do cliente (RECEBER) ou do fornecedor/credor
// (PAGAR); por isso o relatório resolve os dois, o que o extrato (só clientes) não faz.
export async function listarContasVencimento(tipo: TipoConta, inicio: string, fim: string): Promise<ContaRow[]> {
  if (!(await gate())) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return [];
  const supabase = await createServerSupabase();
  const nomeRel = tipo === "RECEBER" ? "clientes(razao_social)" : "fornecedor(nome)";
  const { data } = await supabase
    .from("titulo")
    .select(`id, valor, vencimento, ${nomeRel}`)
    .eq("tipo", tipo)
    .in("status", ["ABERTO", "BAIXADO_PARCIAL"])
    .gte("vencimento", inicio)
    .lte("vencimento", fim)
    .order("vencimento");
  const rows = (data ?? []) as Array<{
    valor: number | string;
    vencimento: string;
    clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
    fornecedor?: { nome?: string } | { nome?: string }[] | null;
  }>;
  return rows.map((r) => {
    const nome = tipo === "RECEBER" ? um(r.clientes)?.razao_social : um(r.fornecedor)?.nome;
    return { nome: nome ?? "—", valor: Number(r.valor), vencimento: r.vencimento };
  });
}

function montarRelatorio(tipo: TipoConta, inicio: string, fim: string, linhas: ContaRow[]): RelatorioExportavel {
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return {
    titulo: tipo === "RECEBER" ? "Contas a receber por vencimento" : "Contas a pagar por vencimento",
    subtitulo: `Vencimento de ${formatarData(inicio)} a ${formatarData(fim)}`,
    colunas: [
      { chave: "nome", rotulo: tipo === "RECEBER" ? "Cliente" : "Credor", formato: "texto" },
      { chave: "valor", rotulo: "Valor", formato: "moeda" },
      { chave: "vencimento", rotulo: "Vencimento", formato: "data" },
    ],
    linhas,
    // vencimento em branco na linha de total: o serializador trata "" como célula vazia.
    totais: { nome: "Total", valor: total, vencimento: "" },
  };
}

export async function exportarContasVencimento(
  tipo: TipoConta,
  inicio: string,
  fim: string,
  formato: FormatoExportacao,
): Promise<ArquivoExportado | { erro: string }> {
  if (!(await gate())) return { erro: "Sem permissão para exportar." };
  const linhas = await listarContasVencimento(tipo, inicio, fim);
  return exportar(montarRelatorio(tipo, inicio, fim, linhas), formato);
}
