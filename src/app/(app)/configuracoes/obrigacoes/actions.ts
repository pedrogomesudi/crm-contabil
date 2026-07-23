"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarMatriz } from "@/lib/obrigacoes/permissoes";
import { MATRIZ_PADRAO } from "@/lib/obrigacoes/seed";
import { diffMatriz, estadoRevisao, type EstadoRevisao, type ResultadoDiff } from "@/lib/obrigacoes/curadoria";

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
  baseLegal: string;
  fonteUrl: string;
  observacaoCuradoria: string;
  revisadaEm: string | null;
  revisadaPorNome: string | null;
  // Derivado no servidor: o cliente não conhece "hoje" sem arriscar divergir da hidratação.
  estadoRevisao: EstadoRevisao;
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

  // Nome do revisor em consulta à parte, e não por embed: o embed do PostgREST depende do
  // nome da constraint e falharia inteiro (derrubando a matriz) se ela mudasse de nome.
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const idsRevisores = [...new Set((data ?? []).map((r) => r.revisada_por as string | null).filter(Boolean))];
  const nomePorId = new Map<string, string>();
  if (idsRevisores.length > 0) {
    const { data: us } = await supabase
      .from("usuarios")
      .select("id, nome")
      .in("id", idsRevisores as string[]);
    for (const u of us ?? []) nomePorId.set(u.id as string, u.nome as string);
  }

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
    baseLegal: (r.base_legal as string | null) ?? "",
    fonteUrl: (r.fonte_url as string | null) ?? "",
    observacaoCuradoria: (r.observacao_curadoria as string | null) ?? "",
    revisadaEm: (r.revisada_em as string | null) ?? null,
    revisadaPorNome: nomePorId.get((r.revisada_por as string | null) ?? "") ?? null,
    estadoRevisao: estadoRevisao((r.revisada_em as string | null) ?? null, hoje),
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
    base_legal: input.baseLegal.trim() || null,
    fonte_url: input.fonteUrl.trim() || null,
    observacao_curadoria: input.observacaoCuradoria.trim() || null,
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

// Curadoria é ato humano: grava QUEM conferiu e QUANDO. O sistema não se autodeclara correto.
export async function marcarRevisada(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { error } = await supabase
    .from("obrigacao")
    .update({ revisada_em: hoje, revisada_por: perfil.id })
    .eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/configuracoes/obrigacoes");
  return { ok: true };
}

// O que o padrão do sistema diz e o banco não reflete. Só campos normativos — preferência do
// escritório (ativa, ordem, folga interna) não entra.
export async function divergenciasDoPadrao(): Promise<ResultadoDiff> {
  if (!(await gate())) return { ausentes: [], divergentes: [] };
  const linhas = await listarMatriz();
  return diffMatriz(
    linhas.map((l) => ({
      codigo: l.codigo,
      esfera: l.esfera,
      periodicidade: l.periodicidade,
      aplicavelA: l.aplicavelA,
      condicaoFlags: l.condicaoFlags,
      condicaoModo: l.condicaoModo,
      ufs: l.ufs,
      cnaePrefixos: l.cnaePrefixos,
      vencDia: l.vencDia,
      vencMesOffset: l.vencMesOffset,
      vencMes: l.vencMes,
      vencAnoOffset: l.vencAnoOffset,
      antecipa: l.antecipa,
      baseLegal: l.baseLegal || null,
    })),
    MATRIZ_PADRAO,
  );
}

const COLUNA_DE: Record<string, string> = {
  esfera: "esfera",
  periodicidade: "periodicidade",
  aplicavelA: "aplicavel_a",
  condicaoFlags: "condicao_flags",
  condicaoModo: "condicao_modo",
  ufs: "ufs",
  cnaePrefixos: "cnae_prefixos",
  vencDia: "venc_dia",
  vencMesOffset: "venc_mes_offset",
  vencMes: "venc_mes",
  vencAnoOffset: "venc_ano_offset",
  antecipa: "antecipa",
  baseLegal: "base_legal",
};

// Aplica UMA divergência — item a item, nunca em massa: sobrescrever tudo apagaria ajuste
// deliberado do escritório, e é por medo disso que a correção nunca chegava.
export async function aplicarDoPadrao(codigo: string, campo: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const coluna = COLUNA_DE[campo];
  const padrao = MATRIZ_PADRAO.find((o) => o.codigo === codigo);
  if (!coluna || !padrao) return { erro: "Campo ou obrigação fora do padrão do sistema." };
  const valor = (padrao as unknown as Record<string, unknown>)[campo] ?? null;
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("obrigacao")
    .update({ [coluna]: valor })
    .eq("codigo", codigo);
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
    base_legal: o.baseLegal,
    fonte_url: o.fonteUrl,
    observacao_curadoria: o.observacaoCuradoria,
    // Omitido na seed = ligada. Desligada é a que exige análise caso a caso (DIRBI, DeSTDA):
    // entra documentada, mas sem gerar instância antes de o escritório decidir.
    ativa: o.ativa ?? true,
    // revisada_em fica nulo: semear não é conferir.
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
