"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { exportar } from "@/app/(app)/exportar/actions";
import { formatarData } from "@/lib/format";
import type { ArquivoExportado, FormatoExportacao, RelatorioExportavel } from "@/lib/exportar/tipos";

export type HonorarioPagoRow = {
  nome: string;
  competencia: string; // "MM/YYYY" (mês dos serviços)
  vencimento: string; // ISO date
  pagamento: string; // ISO date (data do recebimento)
  valor: number; // valor efetivamente recebido
};

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// Competência (date "YYYY-MM-01") exibida como "MM/YYYY".
function competenciaMesAno(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}/${m[1]}` : "—";
}

// "Honorários pagos" = pagamentos (baixas não estornadas) de títulos de honorário mensal
// (origem MENSALIDADE, a receber), filtrados pela DATA DO PAGAMENTO no período. Uma linha por
// pagamento — se um honorário foi quitado em duas baixas, aparecem as duas.
export async function listarHonorariosPagos(inicio: string, fim: string): Promise<HonorarioPagoRow[]> {
  if (!(await gate())) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("baixa")
    .select(
      "data_recebimento, valor_recebido, titulo!inner(competencia, vencimento, origem, tipo, clientes(razao_social))",
    )
    .eq("estornada", false)
    .eq("titulo.origem", "MENSALIDADE")
    .eq("titulo.tipo", "RECEBER")
    .gte("data_recebimento", inicio)
    .lte("data_recebimento", fim)
    .order("data_recebimento");
  const rows = (data ?? []) as Array<{
    data_recebimento: string;
    valor_recebido: number | string;
    titulo?:
      | {
          competencia?: string;
          vencimento?: string;
          clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
        }
      | Array<{
          competencia?: string;
          vencimento?: string;
          clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
        }>
      | null;
  }>;
  return rows.map((r) => {
    const t = um(r.titulo);
    return {
      nome: um(t?.clientes)?.razao_social ?? "—",
      competencia: competenciaMesAno(t?.competencia),
      vencimento: t?.vencimento ?? "",
      pagamento: r.data_recebimento,
      valor: Number(r.valor_recebido),
    };
  });
}

function montarRelatorio(inicio: string, fim: string, linhas: HonorarioPagoRow[]): RelatorioExportavel {
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return {
    titulo: "Honorários pagos",
    subtitulo: `Pagamento de ${formatarData(inicio)} a ${formatarData(fim)} · ${linhas.length} pagamento(s)`,
    colunas: [
      { chave: "nome", rotulo: "Cliente", formato: "texto" },
      { chave: "competencia", rotulo: "Competência", formato: "texto" },
      { chave: "vencimento", rotulo: "Vencimento", formato: "data" },
      { chave: "pagamento", rotulo: "Pagamento", formato: "data" },
      { chave: "valor", rotulo: "Valor pago", formato: "moeda" },
    ],
    linhas,
    totais: { nome: "Total", competencia: "", vencimento: "", pagamento: "", valor: total },
  };
}

export async function exportarHonorariosPagos(
  inicio: string,
  fim: string,
  formato: FormatoExportacao,
): Promise<ArquivoExportado | { erro: string }> {
  if (!(await gate())) return { erro: "Sem permissão para exportar." };
  return exportar(montarRelatorio(inicio, fim, await listarHonorariosPagos(inicio, fim)), formato);
}
