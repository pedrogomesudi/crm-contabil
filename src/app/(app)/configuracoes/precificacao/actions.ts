"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";

type Resp = { ok?: boolean; erro?: string };
export type PrecificacaoView = {
  regimes: { regime: string; valorBase: number }[];
  fatores: {
    fator: string;
    modo: string;
    valorUnitario: number;
    franquia: number;
    faixas: { id: string; ate: number | null; valor: number; ordem: number }[];
  }[];
  complexidades: { id: string; nome: string; multiplicador: number; ordem: number }[];
  servicos: { id: string; nome: string; valor: number; recorrencia: string; ativo: boolean; ordem: number }[];
  global: { valorMinimo: number; descontoMaximoPct: number };
};

async function admin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}
function revalidar() {
  revalidatePath("/configuracoes/precificacao");
  revalidatePath("/comercial/precificacao");
}

export async function carregarPrecificacao(): Promise<PrecificacaoView> {
  const s = await createServerSupabase();
  const [rb, ft, fx, cx, sv, cfg] = await Promise.all([
    s.from("precificacao_regime_base").select("regime, valor_base"),
    s.from("precificacao_fator").select("fator, modo, valor_unitario, franquia"),
    s.from("precificacao_faixa").select("id, fator, ate, valor, ordem").order("ordem"),
    s.from("precificacao_complexidade").select("id, nome, multiplicador, ordem").order("ordem"),
    s.from("precificacao_servico").select("id, nome, valor, recorrencia, ativo, ordem").order("ordem"),
    s.from("precificacao_config").select("valor_minimo, desconto_maximo_pct").maybeSingle(),
  ]);
  const faixasDe = (fator: string) =>
    (fx.data ?? [])
      .filter((f) => f.fator === fator)
      .map((f) => ({
        id: f.id as string,
        ate: f.ate != null ? Number(f.ate) : null,
        valor: Number(f.valor),
        ordem: f.ordem as number,
      }));
  return {
    regimes: (rb.data ?? []).map((r) => ({ regime: r.regime as string, valorBase: Number(r.valor_base) })),
    fatores: (ft.data ?? []).map((f) => ({
      fator: f.fator as string,
      modo: f.modo as string,
      valorUnitario: Number(f.valor_unitario),
      franquia: Number(f.franquia),
      faixas: faixasDe(f.fator as string),
    })),
    complexidades: (cx.data ?? []).map((c) => ({
      id: c.id as string,
      nome: c.nome as string,
      multiplicador: Number(c.multiplicador),
      ordem: c.ordem as number,
    })),
    servicos: (sv.data ?? []).map((v) => ({
      id: v.id as string,
      nome: v.nome as string,
      valor: Number(v.valor),
      recorrencia: v.recorrencia as string,
      ativo: v.ativo as boolean,
      ordem: v.ordem as number,
    })),
    global: {
      valorMinimo: Number(cfg.data?.valor_minimo ?? 0),
      descontoMaximoPct: Number(cfg.data?.desconto_maximo_pct ?? 0),
    },
  };
}

// ---- Regime ----
export async function salvarBaseRegime(regime: string, valor: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(valor) || valor < 0) return { erro: "Valor inválido." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("precificacao_regime_base")
    .upsert({ regime, valor_base: valor }, { onConflict: "regime" });
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

// ---- Fator ----
export async function definirModoFator(fator: string, modo: "faixas" | "unidade"): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_fator").update({ modo }).eq("fator", fator);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function salvarUnidadeFator(fator: string, valorUnitario: number, franquia: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(valorUnitario) || valorUnitario < 0 || !Number.isFinite(franquia) || franquia < 0)
    return { erro: "Valores inválidos." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("precificacao_fator")
    .update({ valor_unitario: valorUnitario, franquia })
    .eq("fator", fator);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

// ---- Faixa ----
export async function criarFaixa(fator: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { data } = await s.from("precificacao_faixa").select("ordem").eq("fator", fator);
  const ordem = (data ?? []).reduce((m, r) => Math.max(m, r.ordem as number), 0) + 1;
  const { error } = await s.from("precificacao_faixa").insert({ fator, ate: null, valor: 0, ordem });
  if (error) return { erro: "Falha ao criar a faixa." };
  revalidar();
  return { ok: true };
}

export async function salvarFaixa(id: string, ate: number | null, valor: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!Number.isFinite(valor) || valor < 0 || (ate != null && (!Number.isFinite(ate) || ate < 0)))
    return { erro: "Valores inválidos." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_faixa").update({ ate, valor }).eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function removerFaixa(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_faixa").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidar();
  return { ok: true };
}

export async function reordenarFaixas(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await s
      .from("precificacao_faixa")
      .update({ ordem: i + 1 })
      .eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}

// ---- Complexidade ----
export async function criarComplexidade(nome: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!nome.trim()) return { erro: "Informe um nome." };
  const s = await createServerSupabase();
  const { data } = await s.from("precificacao_complexidade").select("ordem");
  const ordem = (data ?? []).reduce((m, r) => Math.max(m, r.ordem as number), 0) + 1;
  const { error } = await s.from("precificacao_complexidade").insert({ nome: nome.trim(), multiplicador: 1.0, ordem });
  if (error) return { erro: "Falha ao criar o nível." };
  revalidar();
  return { ok: true };
}

export async function salvarComplexidade(id: string, nome: string, multiplicador: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!nome.trim()) return { erro: "Informe um nome." };
  if (!Number.isFinite(multiplicador) || multiplicador < 0) return { erro: "Multiplicador inválido." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("precificacao_complexidade")
    .update({ nome: nome.trim(), multiplicador })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function removerComplexidade(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_complexidade").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidar();
  return { ok: true };
}

export async function reordenarComplexidades(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await s
      .from("precificacao_complexidade")
      .update({ ordem: i + 1 })
      .eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}

// ---- Serviço ----
export async function criarServico(nome: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!nome.trim()) return { erro: "Informe um nome." };
  const s = await createServerSupabase();
  const { data } = await s.from("precificacao_servico").select("ordem");
  const ordem = (data ?? []).reduce((m, r) => Math.max(m, r.ordem as number), 0) + 1;
  const { error } = await s
    .from("precificacao_servico")
    .insert({ nome: nome.trim(), valor: 0, recorrencia: "mensal", ativo: true, ordem });
  if (error) return { erro: "Falha ao criar o serviço." };
  revalidar();
  return { ok: true };
}

export async function salvarServico(
  id: string,
  dados: { nome: string; valor: number; recorrencia: "mensal" | "unico"; ativo: boolean },
): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (!dados.nome.trim()) return { erro: "Informe um nome." };
  if (!Number.isFinite(dados.valor) || dados.valor < 0) return { erro: "Valor inválido." };
  if (!["mensal", "unico"].includes(dados.recorrencia)) return { erro: "Recorrência inválida." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("precificacao_servico")
    .update({ nome: dados.nome.trim(), valor: dados.valor, recorrencia: dados.recorrencia, ativo: dados.ativo })
    .eq("id", id);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}

export async function removerServico(id: string): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  const { error } = await s.from("precificacao_servico").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidar();
  return { ok: true };
}

export async function reordenarServicos(ids: string[]): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  const s = await createServerSupabase();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await s
      .from("precificacao_servico")
      .update({ ordem: i + 1 })
      .eq("id", ids[i]!);
    if (error) return { erro: "Falha ao reordenar." };
  }
  revalidar();
  return { ok: true };
}

// ---- Globais ----
export async function salvarGlobais(valorMinimo: number, descontoMaximoPct: number): Promise<Resp> {
  if (!(await admin())) return { erro: "Apenas admin." };
  if (
    !Number.isFinite(valorMinimo) ||
    valorMinimo < 0 ||
    !Number.isFinite(descontoMaximoPct) ||
    descontoMaximoPct < 0 ||
    descontoMaximoPct > 100
  )
    return { erro: "Valores inválidos (desconto de 0 a 100)." };
  const s = await createServerSupabase();
  const { error } = await s
    .from("precificacao_config")
    .update({ valor_minimo: valorMinimo, desconto_maximo_pct: descontoMaximoPct })
    .eq("id", true);
  if (error) return { erro: "Falha ao salvar." };
  revalidar();
  return { ok: true };
}
