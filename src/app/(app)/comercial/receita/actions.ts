"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import type { LinhaReceita } from "@/lib/comercial/receita";

export async function carregarReceitaPorOrigem(inicio: string | null, fim: string | null): Promise<LinhaReceita[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();

  // O estado "ganho" vive em `desfecho` (a coluna enum `etapa` virou vestígio na RF-002).
  let q = supabase.from("oportunidade").select("id, origem, valor_estimado").eq("desfecho", "ganho");
  if (inicio && fim) q = q.gte("fechado_em", inicio).lt("fechado_em", fim);
  const { data: ops } = await q;
  const ganhas = ops ?? [];
  if (ganhas.length === 0) return [];

  const ids = ganhas.map((o) => o.id as string);
  // Propostas aceitas dessas oportunidades + seus itens (soma por recorrência, por oportunidade).
  const { data: props } = await supabase
    .from("proposta")
    .select("id, oportunidade_id")
    .eq("status", "aceita")
    .in("oportunidade_id", ids);
  const propostas = props ?? [];
  const propToOp = new Map(propostas.map((pr) => [pr.id as string, pr.oportunidade_id as string]));
  const somas = new Map<string, { mensal: number; unico: number }>(); // por oportunidade_id
  if (propostas.length > 0) {
    const { data: itens } = await supabase
      .from("proposta_item")
      .select("proposta_id, valor, recorrencia")
      .in("proposta_id", [...propToOp.keys()]);
    for (const it of itens ?? []) {
      const opId = propToOp.get(it.proposta_id as string);
      if (!opId) continue;
      const s = somas.get(opId) ?? { mensal: 0, unico: 0 };
      if (it.recorrencia === "mensal") s.mensal += Number(it.valor);
      else s.unico += Number(it.valor);
      somas.set(opId, s);
    }
  }

  return ganhas.map((o) => {
    const s = somas.get(o.id as string) ?? { mensal: 0, unico: 0 };
    return {
      origem: (o.origem as string | null) ?? null,
      valorGanho: o.valor_estimado != null ? Number(o.valor_estimado) : 0,
      propostaMensal: s.mensal,
      propostaUnico: s.unico,
    };
  });
}
