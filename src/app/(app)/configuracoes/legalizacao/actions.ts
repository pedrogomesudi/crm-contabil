"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { slugModelo } from "@/lib/legalizacao/modelo";
import type { LegTipo, LegOrgao } from "@/lib/legalizacao/tipos";

export type EtapaModelo = {
  id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  orgao: LegOrgao;
  prazoDias: number | null;
  responsavelPapel: string | null;
  anexoObrigatorio: boolean;
  avisarCliente: boolean;
};
export type ModeloView = { id: string; tipo: LegTipo; nome: string; ativo: boolean; etapas: number };
export type ModeloDetalhe = {
  id: string;
  tipo: LegTipo;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  etapas: EtapaModelo[];
};

const TIPOS = new Set<LegTipo>([
  "abertura_simples",
  "abertura_presumido",
  "alteracao_quadro",
  "transformacao",
  "baixa",
  "transferencia_entrada",
  "transferencia_saida",
]);
const ORGAOS = new Set<LegOrgao>(["junta", "receita", "prefeitura", "sefaz", "bombeiros", "vigilancia", "outro"]);

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function listarModelos(): Promise<ModeloView[]> {
  if (!(await admin())) return [];
  const supabase = await createServerSupabase();
  const { data: tpls } = await supabase.from("legalizacao_template").select("id, tipo, nome, ativo").order("nome");
  const rows = tpls ?? [];
  const ids = rows.map((t) => t.id as string);
  const { data: etapas } = ids.length
    ? await supabase.from("legalizacao_template_etapa").select("template_id").in("template_id", ids)
    : { data: [] };
  const cont = new Map<string, number>();
  for (const e of etapas ?? []) cont.set(e.template_id as string, (cont.get(e.template_id as string) ?? 0) + 1);
  return rows.map((t) => ({
    id: t.id as string,
    tipo: t.tipo as LegTipo,
    nome: t.nome as string,
    ativo: t.ativo as boolean,
    etapas: cont.get(t.id as string) ?? 0,
  }));
}

export async function obterModelo(id: string): Promise<ModeloDetalhe | null> {
  if (!(await admin())) return null;
  const supabase = await createServerSupabase();
  const { data: t } = await supabase
    .from("legalizacao_template")
    .select("id, tipo, nome, descricao, ativo")
    .eq("id", id)
    .maybeSingle();
  if (!t) return null;
  const { data: etapas } = await supabase
    .from("legalizacao_template_etapa")
    .select("id, ordem, titulo, descricao, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente")
    .eq("template_id", id)
    .order("ordem");
  return {
    id: t.id as string,
    tipo: t.tipo as LegTipo,
    nome: t.nome as string,
    descricao: (t.descricao as string | null) ?? null,
    ativo: t.ativo as boolean,
    etapas: (etapas ?? []).map((e) => ({
      id: e.id as string,
      ordem: e.ordem as number,
      titulo: e.titulo as string,
      descricao: (e.descricao as string | null) ?? null,
      orgao: e.orgao as LegOrgao,
      prazoDias: (e.prazo_dias as number | null) ?? null,
      responsavelPapel: (e.responsavel_papel as string | null) ?? null,
      anexoObrigatorio: e.anexo_obrigatorio as boolean,
      avisarCliente: e.avisar_cliente as boolean,
    })),
  };
}

export async function criarModelo(input: {
  tipo: string;
  nome: string;
  descricao: string | null;
}): Promise<{ id?: string; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!TIPOS.has(input.tipo as LegTipo)) return { erro: "Tipo inválido." };
  const nome = input.nome.trim().slice(0, 160);
  if (!nome) return { erro: "Informe o nome." };
  const supabase = await createServerSupabase();
  const { data: existentesRaw } = await supabase.from("legalizacao_template").select("slug");
  const slug = slugModelo(
    nome,
    (existentesRaw ?? []).map((x) => x.slug as string),
  );
  const { data, error } = await supabase
    .from("legalizacao_template")
    .insert({ tipo: input.tipo, slug, nome, descricao: input.descricao })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao criar." };
  revalidatePath("/configuracoes/legalizacao");
  return { id: data.id as string };
}

export async function salvarModelo(
  id: string,
  input: { nome: string; descricao: string | null; tipo: string; ativo: boolean },
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!TIPOS.has(input.tipo as LegTipo)) return { erro: "Tipo inválido." };
  const nome = input.nome.trim().slice(0, 160);
  if (!nome) return { erro: "Informe o nome." };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("legalizacao_template")
    .update({ nome, descricao: input.descricao, tipo: input.tipo, ativo: input.ativo })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/configuracoes/legalizacao/${id}`);
  revalidatePath("/configuracoes/legalizacao");
  return { ok: true };
}

export async function excluirModelo(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("legalizacao_template").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath("/configuracoes/legalizacao");
  return { ok: true };
}

export async function salvarEtapa(input: {
  id?: string;
  templateId: string;
  titulo: string;
  descricao: string | null;
  orgao: string;
  prazoDias: number | null;
  responsavelPapel: string | null;
  anexoObrigatorio: boolean;
  avisarCliente: boolean;
}): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!ORGAOS.has(input.orgao as LegOrgao)) return { erro: "Órgão inválido." };
  const titulo = input.titulo.trim().slice(0, 200);
  if (!titulo) return { erro: "Informe o título da etapa." };
  const supabase = await createServerSupabase();
  const campos = {
    titulo,
    descricao: input.descricao,
    orgao: input.orgao,
    prazo_dias: input.prazoDias,
    responsavel_papel: input.responsavelPapel || null,
    anexo_obrigatorio: input.anexoObrigatorio,
    avisar_cliente: input.avisarCliente,
  };
  if (input.id) {
    const { error } = await supabase.from("legalizacao_template_etapa").update(campos).eq("id", input.id);
    if (error) return { erro: "Falha ao salvar a etapa." };
  } else {
    const { data: maxRow } = await supabase
      .from("legalizacao_template_etapa")
      .select("ordem")
      .eq("template_id", input.templateId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordem = ((maxRow?.ordem as number | undefined) ?? 0) + 1;
    const { error } = await supabase
      .from("legalizacao_template_etapa")
      .insert({ template_id: input.templateId, ordem, ...campos });
    if (error) return { erro: "Falha ao criar a etapa." };
  }
  revalidatePath(`/configuracoes/legalizacao/${input.templateId}`);
  return { ok: true };
}

export async function excluirEtapa(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { data: e } = await supabase
    .from("legalizacao_template_etapa")
    .select("template_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("legalizacao_template_etapa").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir a etapa." };
  if (e) revalidatePath(`/configuracoes/legalizacao/${e.template_id}`);
  return { ok: true };
}

export async function reordenarEtapa(id: string, direcao: "cima" | "baixo"): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { data: atual } = await supabase
    .from("legalizacao_template_etapa")
    .select("id, ordem, template_id")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { erro: "Etapa não encontrada." };
  const q = supabase
    .from("legalizacao_template_etapa")
    .select("id, ordem")
    .eq("template_id", atual.template_id as string);
  const { data: vizinha } = await (
    direcao === "cima"
      ? q.lt("ordem", atual.ordem as number).order("ordem", { ascending: false })
      : q.gt("ordem", atual.ordem as number).order("ordem", { ascending: true })
  )
    .limit(1)
    .maybeSingle();
  if (!vizinha) return { ok: true };
  await supabase
    .from("legalizacao_template_etapa")
    .update({ ordem: vizinha.ordem })
    .eq("id", atual.id as string);
  await supabase
    .from("legalizacao_template_etapa")
    .update({ ordem: atual.ordem })
    .eq("id", vizinha.id as string);
  revalidatePath(`/configuracoes/legalizacao/${atual.template_id}`);
  return { ok: true };
}
