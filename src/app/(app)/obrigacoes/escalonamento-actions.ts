"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { nivelEscalonamento, escaladoParaUsuario, type Cadeia } from "@/lib/obrigacoes/escalonamento";

export type ItemEscalado = { id: string; clienteNome: string; obrigacaoNome: string; vencimentoInterno: string; diasAtraso: number; nivel: 1 | 2; responsavelNome: string | null };

const diffDias = (a: string, b: string) => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  return p;
}

async function coletar(perfilId: string): Promise<ItemEscalado[]> {
  const admin = createAdminSupabase();
  const { data: cfg } = await admin.from("obrigacao_config").select("escalonamento_ativo, dias_lider, dias_socio").eq("id", 1).maybeSingle();
  if (!cfg?.escalonamento_ativo) return [];
  const diasLider = cfg.dias_lider as number;
  const diasSocio = cfg.dias_socio as number;
  const { data: users } = await admin.from("usuarios").select("id, nome, superior_id");
  const supMap = new Map<string, string | null>();
  const nomeMap = new Map<string, string>();
  for (const u of users ?? []) {
    supMap.set(u.id as string, (u.superior_id as string | null) ?? null);
    nomeMap.set(u.id as string, u.nome as string);
  }
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data } = await admin.from("obrigacao_instancia").select("id, vencimento_interno, responsavel_id, obrigacao(nome), clientes!inner(razao_social)").eq("status", "pendente").is("entregue_em", null).eq("clientes.status", "ativo").lt("vencimento_interno", hoje);
  const out: ItemEscalado[] = [];
  for (const r of data ?? []) {
    const respId = (r.responsavel_id as string | null) ?? null;
    if (!respId) continue;
    const liderId = supMap.get(respId) ?? null;
    const socioId = liderId ? (supMap.get(liderId) ?? null) : null;
    const cadeia: Cadeia = { liderId, socioId };
    const diasAtraso = diffDias(r.vencimento_interno as string, hoje);
    const nivel = nivelEscalonamento(diasAtraso, diasLider, diasSocio);
    if (nivel === 0 || !escaladoParaUsuario(nivel, cadeia, perfilId)) continue;
    const o = um(r.obrigacao as { nome?: string } | { nome?: string }[] | null);
    const cl = um(r.clientes as { razao_social?: string } | { razao_social?: string }[] | null);
    out.push({ id: r.id as string, clienteNome: cl?.razao_social ?? "—", obrigacaoNome: o?.nome ?? "—", vencimentoInterno: r.vencimento_interno as string, diasAtraso, nivel: nivel as 1 | 2, responsavelNome: nomeMap.get(respId) ?? null });
  }
  out.sort((a, b) => b.diasAtraso - a.diasAtraso);
  return out;
}

export async function listarEscalonamento(): Promise<ItemEscalado[]> {
  const p = await gate();
  if (!p) return [];
  return coletar(p.id);
}

export async function contarEscalonamento(): Promise<number> {
  const p = await gate();
  if (!p) return 0;
  return (await coletar(p.id)).length;
}

export async function escalonamentoAtivo(): Promise<boolean> {
  if (!(await gate())) return false;
  const admin = createAdminSupabase();
  const { data } = await admin.from("obrigacao_config").select("escalonamento_ativo").eq("id", 1).maybeSingle();
  return !!data?.escalonamento_ativo;
}
