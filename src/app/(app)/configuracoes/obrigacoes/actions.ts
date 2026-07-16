"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { MATRIZ_PADRAO } from "@/lib/obrigacoes/seed";

export type ObrigacaoRow = {
  id: string;
  codigo: string;
  nome: string;
  esfera: string;
  periodicidade: string;
  aplicavelA: string[];
  condicaoFlags: string[];
  condicaoModo: string;
  ufs: string[];
  cnaePrefixos: string[];
  vencDia: number;
  vencMesOffset: number;
  vencMes: number | null;
  vencAnoOffset: number;
  prazoInternoDiasUteis: number;
  antecipa: boolean;
  comprovanteObrigatorio: boolean;
  ativa: boolean;
  ordem: number;
};

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarMatriz(p.papel)) return null;
  return p;
}

export async function listarMatriz(): Promise<ObrigacaoRow[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao").select("*").order("ordem");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    codigo: r.codigo as string,
    nome: r.nome as string,
    esfera: r.esfera as string,
    periodicidade: r.periodicidade as string,
    aplicavelA: (r.aplicavel_a as string[]) ?? [],
    condicaoFlags: (r.condicao_flags as string[]) ?? [],
    condicaoModo: r.condicao_modo as string,
    ufs: (r.ufs as string[]) ?? [],
    cnaePrefixos: (r.cnae_prefixos as string[]) ?? [],
    vencDia: r.venc_dia as number,
    vencMesOffset: r.venc_mes_offset as number,
    vencMes: (r.venc_mes as number | null) ?? null,
    vencAnoOffset: r.venc_ano_offset as number,
    prazoInternoDiasUteis: r.prazo_interno_dias_uteis as number,
    antecipa: r.antecipa as boolean,
    comprovanteObrigatorio: (r.comprovante_obrigatorio as boolean) ?? true,
    ativa: r.ativa as boolean,
    ordem: r.ordem as number,
  }));
}

export async function salvarObrigacao(
  input: Omit<ObrigacaoRow, "id"> & { id?: string },
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row = {
    codigo: input.codigo,
    nome: input.nome,
    esfera: input.esfera,
    periodicidade: input.periodicidade,
    aplicavel_a: input.aplicavelA,
    condicao_flags: input.condicaoFlags,
    condicao_modo: input.condicaoModo,
    ufs: input.ufs,
    cnae_prefixos: input.cnaePrefixos,
    venc_dia: input.vencDia,
    venc_mes_offset: input.vencMesOffset,
    venc_mes: input.vencMes,
    venc_ano_offset: input.vencAnoOffset,
    prazo_interno_dias_uteis: input.prazoInternoDiasUteis,
    antecipa: input.antecipa,
    comprovante_obrigatorio: input.comprovanteObrigatorio,
    ativa: input.ativa,
    ordem: input.ordem,
  };
  const { error } = input.id
    ? await supabase.from("obrigacao").update(row).eq("id", input.id)
    : await supabase.from("obrigacao").insert(row);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true };
}

export async function excluirObrigacao(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("obrigacao").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true };
}

export async function semearMatrizPadrao(): Promise<{ ok?: boolean; erro?: string; inseridas?: number }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: existentes } = await supabase.from("obrigacao").select("codigo");
  const jaTem = new Set((existentes ?? []).map((e) => e.codigo as string));
  const novas = MATRIZ_PADRAO.filter((o) => !jaTem.has(o.codigo)).map((o) => ({
    codigo: o.codigo,
    nome: o.nome,
    descricao: o.descricao,
    esfera: o.esfera,
    periodicidade: o.periodicidade,
    aplicavel_a: o.aplicavelA,
    condicao_flags: o.condicaoFlags,
    condicao_modo: o.condicaoModo,
    ufs: o.ufs,
    cnae_prefixos: o.cnaePrefixos,
    venc_dia: o.vencDia,
    venc_mes_offset: o.vencMesOffset,
    venc_mes: o.vencMes,
    venc_ano_offset: o.vencAnoOffset,
    prazo_interno_dias_uteis: o.prazoInternoDiasUteis,
    antecipa: o.antecipa,
    ordem: o.ordem,
  }));
  if (novas.length > 0) {
    const { error } = await supabase.from("obrigacao").insert(novas);
    if (error) return { erro: error.message };
  }
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true, inseridas: novas.length };
}

export type ConfigEscalonamentoView = { ativo: boolean; diasLider: number; diasSocio: number };

export async function obterConfigEscalonamento(): Promise<ConfigEscalonamentoView> {
  const p = await getPerfilAtual();
  if (!p?.ativo) return { ativo: false, diasLider: 7, diasSocio: 15 };
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("obrigacao_config")
    .select("escalonamento_ativo, dias_lider, dias_socio")
    .eq("id", 1)
    .maybeSingle();
  return {
    ativo: !!data?.escalonamento_ativo,
    diasLider: (data?.dias_lider as number) ?? 7,
    diasSocio: (data?.dias_socio as number) ?? 15,
  };
}

export async function salvarConfigEscalonamento(
  input: ConfigEscalonamentoView,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const diasLider = Math.max(1, Math.trunc(input.diasLider));
  const diasSocio = Math.max(diasLider, Math.trunc(input.diasSocio));
  const { error } = await supabase
    .from("obrigacao_config")
    .update({ escalonamento_ativo: input.ativo, dias_lider: diasLider, dias_socio: diasSocio })
    .eq("id", 1);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true };
}

// Notificações de obrigações: liga/desliga o badge de riscos no menu lateral (contarRiscos).
export async function obterNotificacaoRiscos(): Promise<boolean> {
  const p = await getPerfilAtual();
  if (!p?.ativo) return true;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("obrigacao_config").select("riscos_badge_ativo").eq("id", 1).maybeSingle();
  return data?.riscos_badge_ativo !== false;
}

export async function definirNotificacaoRiscos(ativo: boolean): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("obrigacao_config").update({ riscos_badge_ativo: ativo }).eq("id", 1);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  revalidatePath("/", "layout");
  return { ok: true };
}
