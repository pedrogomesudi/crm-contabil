"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { resumirNps, type ResumoNps } from "@/lib/nps/score";

export type ComentarioNps = { cliente: string; nota: number; comentario: string; data: string };
export type RelatorioNps = { resumo: ResumoNps; comentarios: ComentarioNps[] };

export async function relatorioNps(de: string, ate: string): Promise<RelatorioNps | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return null;
  const admin = createAdminSupabase();
  // criada_em é timestamptz: limite superior no fim do dia `ate`.
  const { data } = await admin
    .from("nps_resposta")
    .select("nota, comentario, criada_em, clientes(razao_social)")
    .gte("criada_em", de)
    .lte("criada_em", `${ate}T23:59:59`)
    .order("criada_em", { ascending: false });
  const linhas = data ?? [];
  const resumo = resumirNps(linhas.map((l) => Number(l.nota)));
  const razaoDe = (v: unknown): string => {
    const c = v as { razao_social?: string } | { razao_social?: string }[] | null;
    const um = Array.isArray(c) ? c[0] : c;
    return um?.razao_social ?? "—";
  };
  const comentarios: ComentarioNps[] = linhas
    .filter((l) => (l.comentario as string | null)?.trim())
    .map((l) => ({
      cliente: razaoDe(l.clientes),
      nota: Number(l.nota),
      comentario: l.comentario as string,
      data: (l.criada_em as string).slice(0, 10),
    }));
  return { resumo, comentarios };
}
