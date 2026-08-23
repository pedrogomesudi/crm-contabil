"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { exportar } from "@/app/(app)/exportar/actions";
import { formatarData } from "@/lib/format";
import { situacaoAtraso } from "@/lib/financeiro/relatorios";
import type { ArquivoExportado, FormatoExportacao, RelatorioExportavel } from "@/lib/exportar/tipos";

export type HonorarioAbertoRow = {
  nome: string;
  competencia: string; // "MM/YYYY" (mês dos serviços)
  vencimento: string; // ISO date
  situacao: string; // "A vencer" | "Vencido há N dias"
  valor: number; // saldo ainda em aberto
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

function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// "Honorários em aberto" = títulos de honorário mensal (origem MENSALIDADE, a receber) ainda
// devidos (ABERTO ou baixa parcial), com vencimento no período. O valor é o SALDO em aberto
// (valor do título menos as baixas não estornadas), então parciais aparecem só pelo que falta.
export async function listarHonorariosAbertos(inicio: string, fim: string): Promise<HonorarioAbertoRow[]> {
  if (!(await gate())) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("titulo")
    .select("valor, competencia, vencimento, clientes(razao_social), baixa(valor_recebido, estornada)")
    .eq("origem", "MENSALIDADE")
    .eq("tipo", "RECEBER")
    .in("status", ["ABERTO", "BAIXADO_PARCIAL"])
    .gte("vencimento", inicio)
    .lte("vencimento", fim)
    .order("vencimento");
  const hoje = hojeSaoPaulo();
  const rows = (data ?? []) as Array<{
    valor: number | string;
    competencia?: string;
    vencimento?: string;
    clientes?: { razao_social?: string } | { razao_social?: string }[] | null;
    baixa?: { valor_recebido: number | string; estornada: boolean }[] | null;
  }>;
  return rows
    .map((r) => {
      const pago = (r.baixa ?? []).filter((b) => !b.estornada).reduce((s, b) => s + Number(b.valor_recebido), 0);
      const saldo = Number(r.valor) - pago;
      const vencimento = r.vencimento ?? "";
      return {
        nome: um(r.clientes)?.razao_social ?? "—",
        competencia: competenciaMesAno(r.competencia),
        vencimento,
        situacao: vencimento ? situacaoAtraso(vencimento, hoje) : "—",
        valor: saldo,
      };
    })
    .filter((l) => l.valor > 0.005); // ignora resíduos de arredondamento
}

function montarRelatorio(inicio: string, fim: string, linhas: HonorarioAbertoRow[]): RelatorioExportavel {
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return {
    titulo: "Honorários em aberto",
    subtitulo: `Vencimento de ${formatarData(inicio)} a ${formatarData(fim)} · ${linhas.length} honorário(s) em aberto`,
    colunas: [
      { chave: "nome", rotulo: "Cliente", formato: "texto" },
      { chave: "competencia", rotulo: "Competência", formato: "texto" },
      { chave: "vencimento", rotulo: "Vencimento", formato: "data" },
      { chave: "situacao", rotulo: "Situação", formato: "texto" },
      { chave: "valor", rotulo: "Valor em aberto", formato: "moeda" },
    ],
    linhas,
    totais: { nome: "Total", competencia: "", vencimento: "", situacao: "", valor: total },
  };
}

export async function exportarHonorariosAbertos(
  inicio: string,
  fim: string,
  formato: FormatoExportacao,
): Promise<ArquivoExportado | { erro: string }> {
  if (!(await gate())) return { erro: "Sem permissão para exportar." };
  return exportar(montarRelatorio(inicio, fim, await listarHonorariosAbertos(inicio, fim)), formato);
}
