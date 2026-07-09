"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import type { EtapaOportunidade } from "@/lib/comercial/funil";

export type OportunidadeView = { id: string; prospectNome: string; contatoNome: string | null; contatoTelefone: string | null; contatoEmail: string | null; origem: string | null; servicoInteresse: string | null; valorEstimado: number | null; responsavelId: string | null; responsavelNome: string | null; etapa: EtapaOportunidade; observacoes: string | null; motivoPerda: string | null; clienteId: string | null; meu: boolean; criadoEm: string; fechadoEm: string | null };
export type OportunidadeInput = { prospectNome: string; contatoNome: string | null; contatoTelefone: string | null; contatoEmail: string | null; origem: string | null; servicoInteresse: string | null; valorEstimado: number | null; responsavelId: string | null; observacoes: string | null };

function paraColunas(input: OportunidadeInput) {
  return {
    prospect_nome: input.prospectNome.trim(),
    contato_nome: input.contatoNome,
    contato_telefone: input.contatoTelefone,
    contato_email: input.contatoEmail,
    origem: input.origem,
    servico_interesse: input.servicoInteresse,
    valor_estimado: input.valorEstimado,
    responsavel_id: input.responsavelId,
    observacoes: input.observacoes,
  };
}

export async function listarOportunidades(): Promise<OportunidadeView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("oportunidade").select("id, prospect_nome, contato_nome, contato_telefone, contato_email, origem, servico_interesse, valor_estimado, responsavel_id, etapa, observacoes, motivo_perda, cliente_id, criado_em, fechado_em").order("criado_em", { ascending: false });
  const rows = data ?? [];
  const respIds = [...new Set(rows.map((r) => r.responsavel_id as string | null).filter((x): x is string => !!x))];
  const usMap = new Map<string, string>();
  if (respIds.length) {
    const { data: us } = await supabase.from("usuarios").select("id, nome").in("id", respIds);
    for (const u of us ?? []) usMap.set(u.id as string, u.nome as string);
  }
  return rows.map((r) => ({
    id: r.id as string,
    prospectNome: r.prospect_nome as string,
    contatoNome: (r.contato_nome as string | null) ?? null,
    contatoTelefone: (r.contato_telefone as string | null) ?? null,
    contatoEmail: (r.contato_email as string | null) ?? null,
    origem: (r.origem as string | null) ?? null,
    servicoInteresse: (r.servico_interesse as string | null) ?? null,
    valorEstimado: r.valor_estimado != null ? Number(r.valor_estimado) : null,
    responsavelId: (r.responsavel_id as string | null) ?? null,
    responsavelNome: r.responsavel_id ? (usMap.get(r.responsavel_id as string) ?? null) : null,
    etapa: r.etapa as EtapaOportunidade,
    observacoes: (r.observacoes as string | null) ?? null,
    motivoPerda: (r.motivo_perda as string | null) ?? null,
    clienteId: (r.cliente_id as string | null) ?? null,
    meu: r.responsavel_id === p.id,
    criadoEm: r.criado_em as string,
    fechadoEm: (r.fechado_em as string | null) ?? null,
  }));
}

export async function criarOportunidade(input: OportunidadeInput): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  if (!input.prospectNome.trim()) return { erro: "Informe o prospect." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("oportunidade").insert(paraColunas(input));
  if (error) return { erro: "Falha ao criar." };
  revalidatePath("/comercial");
  return { ok: true };
}

export async function salvarOportunidade(id: string, input: OportunidadeInput): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  if (!input.prospectNome.trim()) return { erro: "Informe o prospect." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("oportunidade").update({ ...paraColunas(input), atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/comercial");
  return { ok: true };
}

export async function definirEtapa(id: string, etapa: EtapaOportunidade, motivo?: string | null): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = { etapa, atualizado_em: new Date().toISOString() };
  patch.fechado_em = etapa === "ganho" || etapa === "perdido" ? new Date().toISOString() : null;
  if (etapa === "perdido") patch.motivo_perda = motivo ?? null;
  const { error } = await supabase.from("oportunidade").update(patch).eq("id", id);
  if (error) return { erro: "Falha ao mover." };
  revalidatePath("/comercial");
  return { ok: true };
}
