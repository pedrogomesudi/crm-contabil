"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";

export type CustoView = {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  custoHora: number;
  vigenciaInicio: string;
  vigenciaFim: string | null;
};

const ROTA = "/configuracoes/custos";

// Custo/hora é dado salarial: SÓ admin, aqui e na RLS.
async function exigirAdmin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function listarCustos(): Promise<CustoView[]> {
  if (!(await exigirAdmin())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("colaborador_custo")
    .select("id, usuario_id, custo_hora, vigencia_inicio, vigencia_fim, usuarios(nome)")
    .order("vigencia_inicio", { ascending: false });

  return (data ?? []).map((c) => {
    const u = Array.isArray(c.usuarios) ? c.usuarios[0] : c.usuarios;
    return {
      id: c.id as string,
      usuarioId: c.usuario_id as string,
      usuarioNome: (u as { nome?: string } | null)?.nome ?? "—",
      custoHora: Number(c.custo_hora),
      vigenciaInicio: c.vigencia_inicio as string,
      vigenciaFim: (c.vigencia_fim as string | null) ?? null,
    };
  });
}

// Nova vigência FECHA a anterior (fim = início − 1 dia). Duas vigências abertas ao mesmo
// tempo fariam o custo do apontamento depender da ordem da consulta — silenciosamente.
export async function salvarCusto(input: {
  usuarioId: string;
  custoHora: number;
  vigenciaInicio: string;
}): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  if (!input.usuarioId) return { erro: "Escolha o colaborador." };
  if (!Number.isFinite(input.custoHora) || input.custoHora < 0) return { erro: "Custo/hora inválido." };
  if (!input.vigenciaInicio) return { erro: "Informe o início da vigência." };

  const supabase = await createServerSupabase();
  const [a, m, d] = input.vigenciaInicio.split("-").map(Number);
  const anterior = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1)).toISOString().slice(0, 10);

  await supabase
    .from("colaborador_custo")
    .update({ vigencia_fim: anterior })
    .eq("usuario_id", input.usuarioId)
    .is("vigencia_fim", null);

  const { error } = await supabase.from("colaborador_custo").insert({
    usuario_id: input.usuarioId,
    custo_hora: input.custoHora,
    vigencia_inicio: input.vigenciaInicio,
  });
  if (error) return { erro: "Falha ao salvar o custo." };

  revalidatePath(ROTA);
  return { ok: true };
}

export async function excluirCusto(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("colaborador_custo").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath(ROTA);
  return { ok: true };
}
