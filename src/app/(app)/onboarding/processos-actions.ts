"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { progressoProcesso, type StatusItem } from "@/lib/onboarding/processo";

export type ResumoProcesso = { processoId: string; clienteId: string; razaoSocial: string; perfil: string; total: number; concluidos: number; pct: number; concluido: boolean; proximoPrazo: string | null };

export async function listarProcessos(): Promise<ResumoProcesso[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data: procs } = await supabase.from("onboarding_processo").select("id, perfil, cliente_id, clientes(razao_social)");
  if (!procs || procs.length === 0) return [];
  const { data: itens } = await supabase.from("onboarding_processo_item").select("processo_id, status, prazo, bloqueante").in("processo_id", procs.map((x) => x.id as string));
  const porProc = new Map<string, { status: StatusItem; prazo: string | null; bloqueante: boolean }[]>();
  for (const i of itens ?? []) {
    const arr = porProc.get(i.processo_id as string) ?? [];
    arr.push({ status: i.status as StatusItem, prazo: i.prazo as string | null, bloqueante: i.bloqueante as boolean });
    porProc.set(i.processo_id as string, arr);
  }
  const out = procs.map((pr) => {
    const cli = Array.isArray(pr.clientes) ? pr.clientes[0] : pr.clientes;
    const prog = progressoProcesso(porProc.get(pr.id as string) ?? []);
    return { processoId: pr.id as string, clienteId: pr.cliente_id as string, razaoSocial: (cli?.razao_social as string) ?? "—", perfil: pr.perfil as string, total: prog.total, concluidos: prog.concluidos, pct: prog.pct, concluido: prog.concluido, proximoPrazo: prog.proximoPrazo };
  });
  return out.sort((a, b) => a.pct - b.pct);
}
