"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { exportar } from "@/app/(app)/exportar/actions";
import { formatarDocumento } from "@/lib/format";
import { honorarioEm } from "@/lib/financeiro/vigencia";
import type { ArquivoExportado, FormatoExportacao, RelatorioExportavel } from "@/lib/exportar/tipos";

export type ClienteHonorarioRow = { nome: string; documento: string; honorario: number };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

// Um cliente por linha: razão social, CPF/CNPJ e o honorário mensal VIGENTE hoje —
// resolvido da tabela de vigências (a linha com maior vigente_de <= mês corrente),
// a mesma lógica dos indicadores. Só clientes ativos e não excluídos.
export async function listarClientesHonorario(): Promise<ClienteHonorarioRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, honorario_vigencia(vigente_de, valor, estimada)")
    .is("excluido_em", null)
    .eq("status", "ativo")
    .order("razao_social");
  const mes = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const rows = (data ?? []) as Array<{
    razao_social: string | null;
    cpf_cnpj: string | null;
    honorario_vigencia?: { vigente_de: string; valor: number; estimada: boolean }[] | null;
  }>;
  return rows.map((c) => {
    const vig = (c.honorario_vigencia ?? []).map((v) => ({
      vigenteDe: v.vigente_de,
      valor: Number(v.valor),
      estimada: v.estimada,
    }));
    return {
      nome: c.razao_social ?? "—",
      documento: c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj) : "—",
      honorario: vig.length ? honorarioEm(vig, mes).valor : 0,
    };
  });
}

function montarRelatorio(linhas: ClienteHonorarioRow[]): RelatorioExportavel {
  const total = linhas.reduce((s, l) => s + l.honorario, 0);
  return {
    titulo: "Clientes e honorários",
    subtitulo: `Honorário mensal vigente · ${linhas.length} cliente(s) ativo(s)`,
    colunas: [
      { chave: "nome", rotulo: "Cliente / Razão social", formato: "texto" },
      { chave: "documento", rotulo: "CPF/CNPJ", formato: "texto" },
      { chave: "honorario", rotulo: "Honorário mensal", formato: "moeda" },
    ],
    linhas,
    totais: { nome: "Total", documento: "", honorario: total },
  };
}

export async function exportarClientesHonorario(
  formato: FormatoExportacao,
): Promise<ArquivoExportado | { erro: string }> {
  if (!(await gate())) return { erro: "Sem permissão para exportar." };
  return exportar(montarRelatorio(await listarClientesHonorario()), formato);
}
