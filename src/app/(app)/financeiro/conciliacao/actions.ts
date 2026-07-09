"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { dedupHash, type MovimentoBruto } from "@/lib/conciliacao/parse";

export type MovimentoView = { id: string; data: string; descricao: string; valor: number; status: string };

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarFinanceiro(p.papel)) return null;
  return p;
}

export async function listarContas(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("conta_bancaria").select("id, nome").eq("ativa", true).order("nome");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }));
}

export async function jaImportados(contaId: string, hashes: string[]): Promise<string[]> {
  if (!(await gate()) || hashes.length === 0) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("movimento_bancario").select("dedup_hash").eq("conta_bancaria_id", contaId).in("dedup_hash", hashes);
  return (data ?? []).map((r) => r.dedup_hash as string);
}

export async function importarMovimentos(contaId: string, movimentos: MovimentoBruto[]): Promise<{ inseridos: number; ignorados: number } | { erro: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  if (!contaId) return { erro: "Selecione a conta." };
  const supabase = await createServerSupabase();
  const comHash = movimentos.map((m) => ({ m, hash: dedupHash(m) }));
  const hashes = [...new Set(comHash.map((x) => x.hash))];
  const existentes = new Set(await jaImportados(contaId, hashes));
  const vistos = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const { m, hash } of comHash) {
    if (existentes.has(hash) || vistos.has(hash)) continue;
    vistos.add(hash);
    rows.push({ conta_bancaria_id: contaId, data: m.data, valor: m.valor, descricao: m.descricao || null, fitid: m.fitid, dedup_hash: hash, importado_por: perfil.id });
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("movimento_bancario").insert(rows);
    if (error) return { erro: error.message };
  }
  return { inseridos: rows.length, ignorados: movimentos.length - rows.length };
}

export async function listarMovimentos(contaId: string, inicio: string, fim: string, status: string): Promise<MovimentoView[]> {
  if (!(await gate()) || !contaId) return [];
  const supabase = await createServerSupabase();
  let q = supabase.from("movimento_bancario").select("id, data, descricao, valor, status").eq("conta_bancaria_id", contaId).gte("data", inicio).lte("data", fim).order("data");
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((r) => ({ id: r.id as string, data: r.data as string, descricao: (r.descricao as string | null) ?? "", valor: Number(r.valor), status: r.status as string }));
}
