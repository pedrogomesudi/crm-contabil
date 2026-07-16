"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { resumirConformidade, type ResumoConformidade } from "@/lib/obrigacoes/conformidade";

export type LinhaConformidade = { clienteNome: string; resumo: ResumoConformidade };
export type RelatorioConformidade = { geral: ResumoConformidade; porCliente: LinhaConformidade[] };

type Inst = { status: string; entregueEm: string | null; vencimentoLegal: string };
const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

export async function relatorioConformidade(ano: number, mes: number | null): Promise<RelatorioConformidade> {
  const vazio: RelatorioConformidade = {
    geral: {
      total: 0,
      noPrazo: 0,
      comAtraso: 0,
      pendenteVencida: 0,
      pendenteNoPrazo: 0,
      dispensada: 0,
      pctConformidade: 100,
    },
    porCliente: [],
  };
  if (!(await gate())) return vazio;
  const supabase = await createServerSupabase();
  const ini = mes ? `${ano}-${String(mes).padStart(2, "0")}-01` : `${ano}-01-01`;
  const fim = mes
    ? `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`
    : `${ano}-12-31`;
  const { data } = await supabase
    .from("obrigacao_instancia")
    .select("status, entregue_em, vencimento_legal, clientes(razao_social)")
    .gte("competencia", ini)
    .lte("competencia", fim);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const todas: Inst[] = [];
  const porClienteMap = new Map<string, Inst[]>();
  for (const r of data ?? []) {
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    const nome = cl?.razao_social ?? "—";
    const inst: Inst = {
      status: r.status as string,
      entregueEm: (r.entregue_em as string | null) ?? null,
      vencimentoLegal: r.vencimento_legal as string,
    };
    todas.push(inst);
    const arr = porClienteMap.get(nome) ?? [];
    arr.push(inst);
    porClienteMap.set(nome, arr);
  }
  const porCliente: LinhaConformidade[] = [...porClienteMap.entries()].map(([clienteNome, itens]) => ({
    clienteNome,
    resumo: resumirConformidade(itens, hoje),
  }));
  porCliente.sort((a, b) => a.resumo.pctConformidade - b.resumo.pctConformidade);
  return { geral: resumirConformidade(todas, hoje), porCliente };
}
