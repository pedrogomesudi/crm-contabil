"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarRecorrencias, podeGerenciarTarefas } from "@/lib/clientes/permissoes";
import type { SopEtapa } from "@/lib/tarefas/sop";
import type { Departamento } from "@/lib/clientes/departamentos";
import type { TarefaPrioridade } from "@/lib/tarefas/tarefa";
import type { Papel } from "@/lib/tipos";

export type SopTemplateView = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  departamento: Departamento | null;
  ativo: boolean;
  etapas: SopEtapa[];
};

export type EtapaInput = {
  onda: number;
  ordem: number;
  titulo: string;
  descricao: string | null;
  responsavelPapel: Papel | null;
  prazoDias: number;
  prioridade: TarefaPrioridade;
  itens: string[];
};

const ROTA = "/configuracoes/sop";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarRecorrencias(p.papel) ? p : null;
}

export async function listarTemplatesSop(): Promise<SopTemplateView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarTarefas(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("sop_template")
    .select(
      "id, slug, nome, descricao, departamento, ativo, sop_etapa(id, onda, ordem, titulo, descricao, responsavel_papel, prazo_dias, prioridade, sop_etapa_item(descricao, ordem))",
    )
    .order("nome");

  return (data ?? []).map((t) => ({
    id: t.id as string,
    slug: t.slug as string,
    nome: t.nome as string,
    descricao: (t.descricao as string | null) ?? null,
    departamento: (t.departamento as Departamento | null) ?? null,
    ativo: t.ativo as boolean,
    etapas: ((t.sop_etapa ?? []) as Record<string, unknown>[]).map((e) => ({
      id: e.id as string,
      onda: e.onda as number,
      ordem: e.ordem as number,
      titulo: e.titulo as string,
      descricao: (e.descricao as string | null) ?? null,
      responsavelPapel: (e.responsavel_papel as string | null) ?? null,
      prazoDias: e.prazo_dias as number,
      prioridade: e.prioridade as string,
      itens: ((e.sop_etapa_item ?? []) as { descricao: string; ordem: number }[])
        .sort((a, b) => a.ordem - b.ordem)
        .map((i) => i.descricao),
    })),
  }));
}

// Salva o template e REESCREVE as etapas — mais simples e sem estado órfão. As tarefas
// já geradas por processos em andamento não são afetadas (são cópias, como no onboarding).
export async function salvarTemplateSop(input: {
  id?: string;
  slug: string;
  nome: string;
  descricao: string | null;
  departamento: Departamento | null;
  ativo: boolean;
  etapas: EtapaInput[];
}): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const nome = input.nome.trim().slice(0, 160);
  const slug = input.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  if (!nome) return { erro: "Informe o nome." };
  if (!slug) return { erro: "Informe um identificador (slug)." };
  if (input.etapas.length === 0) return { erro: "Adicione ao menos uma etapa." };

  const supabase = await createServerSupabase();
  const row = {
    slug,
    nome,
    descricao: input.descricao,
    departamento: input.departamento,
    ativo: input.ativo,
  };
  const { data, error } = input.id
    ? await supabase.from("sop_template").update(row).eq("id", input.id).select("id").single()
    : await supabase.from("sop_template").insert(row).select("id").single();
  if (error || !data) return { erro: "Falha ao salvar (identificador já usado?)." };
  const templateId = data.id as string;

  await supabase.from("sop_etapa").delete().eq("template_id", templateId);
  for (const e of input.etapas) {
    const titulo = e.titulo.trim().slice(0, 200);
    if (!titulo) continue;
    const { data: etapa } = await supabase
      .from("sop_etapa")
      .insert({
        template_id: templateId,
        onda: Math.max(1, e.onda),
        ordem: e.ordem,
        titulo,
        descricao: e.descricao,
        responsavel_papel: e.responsavelPapel,
        prazo_dias: e.prazoDias,
        prioridade: e.prioridade,
      })
      .select("id")
      .single();
    const itens = e.itens.map((i) => i.trim()).filter(Boolean);
    if (etapa && itens.length > 0) {
      await supabase
        .from("sop_etapa_item")
        .insert(itens.map((descricao, ordem) => ({ etapa_id: etapa.id as string, descricao, ordem })));
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

export async function excluirTemplateSop(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("sop_template").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir (há processo em andamento com este modelo?)." };
  revalidatePath(ROTA);
  return { ok: true };
}
