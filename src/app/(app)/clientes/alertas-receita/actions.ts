"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeCriarCliente } from "@/lib/clientes/permissoes";

export async function contarAlertasReceita(): Promise<number> {
  const supabase = await createServerSupabase();
  const { data: cfg } = await supabase.from("receita_config").select("badge_ativo").eq("id", 1).maybeSingle();
  if (cfg && cfg.badge_ativo === false) return 0;
  const { count } = await supabase
    .from("receita_alerta")
    .select("id", { count: "exact", head: true })
    .is("resolvido_em", null);
  return count ?? 0;
}

export type AlertaReceita = {
  id: string;
  clienteId: string;
  cliente: string;
  tipo: string;
  de: string | null;
  para: string | null;
  criadoEm: string;
};

export async function listarAlertasReceita(): Promise<AlertaReceita[]> {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("receita_alerta")
    .select("id, cliente_id, tipo, de, para, criado_em, clientes(razao_social)")
    .is("resolvido_em", null)
    .order("criado_em", { ascending: false })
    .limit(200);
  return (data ?? []).map((a) => {
    const cli = a.clientes as unknown as { razao_social: string } | { razao_social: string }[] | null;
    const um = Array.isArray(cli) ? cli[0] : cli;
    return {
      id: a.id as string,
      clienteId: a.cliente_id as string,
      cliente: um?.razao_social ?? "—",
      tipo: a.tipo as string,
      de: (a.de as string | null) ?? null,
      para: (a.para as string | null) ?? null,
      criadoEm: a.criado_em as string,
    };
  });
}

export async function resolverAlertaReceita(id: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("receita_alerta")
    .update({ resolvido_em: new Date().toISOString(), resolvido_por: perfil.id })
    .eq("id", id);
  if (error) return { erro: "Falha ao resolver." };
  revalidatePath("/clientes/alertas-receita");
  return { ok: true };
}
