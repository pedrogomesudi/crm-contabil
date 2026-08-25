"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { exportar } from "@/app/(app)/exportar/actions";
import { formatarTelefone } from "@/lib/format";
import type { ArquivoExportado, FormatoExportacao, RelatorioExportavel } from "@/lib/exportar/tipos";

export type ContatoHonorarioRow = {
  nome: string;
  celular: string;
  email: string;
  honorario: number;
  vencimento: string; // "Dia 12"
};

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// Contatos + cobrança de cada cliente ativo: celular, e-mail, honorário mensal e dia de
// vencimento. Valor e dia vêm de clientes_financeiro (fonte da geração de mensalidades e a
// única que cobre 100% dos clientes; o dia usa padrão 10, como no gerar_mensalidades).
export async function listarContatosHonorario(): Promise<ContatoHonorarioRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("razao_social, telefone, email, clientes_financeiro(honorario_mensal, dia_vencimento)")
    .is("excluido_em", null)
    .eq("status", "ativo")
    .order("razao_social");
  const rows = (data ?? []) as Array<{
    razao_social: string | null;
    telefone: string | null;
    email: string | null;
    clientes_financeiro?:
      | { honorario_mensal: number | null; dia_vencimento: number | null }
      | { honorario_mensal: number | null; dia_vencimento: number | null }[]
      | null;
  }>;
  return rows.map((c) => {
    const cf = um(c.clientes_financeiro);
    return {
      nome: c.razao_social ?? "—",
      celular: c.telefone ? formatarTelefone(c.telefone) : "—",
      email: c.email || "—",
      honorario: Number(cf?.honorario_mensal ?? 0),
      vencimento: `Dia ${cf?.dia_vencimento ?? 10}`,
    };
  });
}

function montarRelatorio(linhas: ContatoHonorarioRow[]): RelatorioExportavel {
  const total = linhas.reduce((s, l) => s + l.honorario, 0);
  return {
    titulo: "Contatos e honorários",
    subtitulo: `Celular, e-mail, honorário mensal e vencimento · ${linhas.length} cliente(s) ativo(s)`,
    colunas: [
      { chave: "nome", rotulo: "Cliente", formato: "texto" },
      { chave: "celular", rotulo: "Celular", formato: "texto" },
      { chave: "email", rotulo: "E-mail", formato: "texto" },
      { chave: "honorario", rotulo: "Honorário mensal", formato: "moeda" },
      { chave: "vencimento", rotulo: "Vencimento", formato: "texto" },
    ],
    linhas,
    totais: { nome: "Total", celular: "", email: "", honorario: total, vencimento: "" },
  };
}

export async function exportarContatosHonorario(
  formato: FormatoExportacao,
): Promise<ArquivoExportado | { erro: string }> {
  if (!(await gate())) return { erro: "Sem permissão para exportar." };
  return exportar(montarRelatorio(await listarContatosHonorario()), formato);
}
