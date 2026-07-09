"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { classificarAlerta, ordemSeveridade, type SeveridadeAlerta } from "@/lib/onboarding/alertas";

export type AlertaView = { itemId: string; clienteId: string; razaoSocial: string; blocoNome: string; codigo: string | null; titulo: string; prazo: string; severidade: SeveridadeAlerta; bloqueante: boolean; responsavelNome: string | null; meu: boolean };

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function coletar(usuarioId: string): Promise<AlertaView[]> {
  const supabase = await createServerSupabase();
  const { data: itens } = await supabase
    .from("onboarding_processo_item")
    .select("id, processo_id, bloco_nome, codigo, titulo, prazo, bloqueante, responsavel_id")
    .eq("status", "pendente")
    .not("prazo", "is", null);
  const rows = itens ?? [];
  if (rows.length === 0) return [];
  const procIds = [...new Set(rows.map((r) => r.processo_id as string))];
  const { data: procs } = await supabase.from("onboarding_processo").select("id, cliente_id, clientes(razao_social)").in("id", procIds);
  const procMap = new Map<string, { clienteId: string; razao: string }>();
  for (const pr of procs ?? []) {
    const cli = Array.isArray(pr.clientes) ? pr.clientes[0] : pr.clientes;
    procMap.set(pr.id as string, { clienteId: pr.cliente_id as string, razao: (cli?.razao_social as string) ?? "—" });
  }
  const respIds = [...new Set(rows.map((r) => r.responsavel_id as string | null).filter((x): x is string => !!x))];
  const usMap = new Map<string, string>();
  if (respIds.length) {
    const { data: us } = await supabase.from("usuarios").select("id, nome").in("id", respIds);
    for (const u of us ?? []) usMap.set(u.id as string, u.nome as string);
  }
  const hoje = hojeSP();
  const out: AlertaView[] = [];
  for (const r of rows) {
    const sev = classificarAlerta(r.prazo as string, hoje);
    if (!sev) continue;
    const pr = procMap.get(r.processo_id as string);
    const respId = r.responsavel_id as string | null;
    out.push({
      itemId: r.id as string,
      clienteId: pr?.clienteId ?? "",
      razaoSocial: pr?.razao ?? "—",
      blocoNome: r.bloco_nome as string,
      codigo: (r.codigo as string | null) ?? null,
      titulo: r.titulo as string,
      prazo: r.prazo as string,
      severidade: sev,
      bloqueante: r.bloqueante as boolean,
      responsavelNome: respId ? (usMap.get(respId) ?? null) : null,
      meu: respId === usuarioId,
    });
  }
  out.sort((a, b) => ordemSeveridade(a.severidade) - ordemSeveridade(b.severidade) || a.prazo.localeCompare(b.prazo));
  return out;
}

export async function listarAlertas(): Promise<AlertaView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  if (!(await obterAlertasAtivos())) return [];
  return coletar(p.id);
}

export async function contarAlertas(): Promise<number> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return 0;
  if (!(await obterAlertasAtivos())) return 0;
  return (await coletar(p.id)).length;
}

export async function obterAlertasAtivos(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_config").select("alertas_ativos").eq("id", 1).maybeSingle();
  return Boolean(data?.alertas_ativos ?? true);
}

export async function definirAlertasAtivos(ativo: boolean): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_config").update({ alertas_ativos: ativo, atualizado_em: new Date().toISOString() }).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/onboarding");
  revalidatePath("/onboarding");
  return { ok: true };
}
