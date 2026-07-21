"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listarEquipe } from "@/lib/clientes/colaboradores";
import { agruparProdutividade, type LinhaProdutividade } from "@/lib/timesheet/produtividade";

// service_role: precisa listar a equipe (RLS de usuarios não deixa) e ler apontamentos,
// tarefas e obrigações de todo mundo. Gate admin-only: o relatório nomeia cada pessoa.
export async function relatorioProdutividade(de: string, ate: string): Promise<LinhaProdutividade[] | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || perfil.papel !== "admin") return null;

  const admin = createAdminSupabase();

  const [apontRes, tarefasRes, obrigRes, equipe] = await Promise.all([
    admin.from("apontamento").select("usuario_id, cliente_id, minutos").gte("data", de).lte("data", ate),
    // concluida_em é timestamptz (as outras datas são date): o fim do dia `ate` precisa
    // do T23:59:59, senão tarefa concluída no próprio dia `ate` fica de fora.
    admin
      .from("tarefa")
      .select("responsavel_id")
      .eq("status", "concluida")
      .gte("concluida_em", de)
      .lte("concluida_em", `${ate}T23:59:59`),
    admin
      .from("obrigacao_instancia")
      .select("entregue_por")
      .not("entregue_por", "is", null)
      .gte("entregue_em", de)
      .lte("entregue_em", ate),
    listarEquipe(),
  ]);

  const tarefasPorResponsavel: Record<string, number> = {};
  for (const t of tarefasRes.data ?? []) {
    const id = t.responsavel_id as string | null;
    if (id) tarefasPorResponsavel[id] = (tarefasPorResponsavel[id] ?? 0) + 1;
  }

  const obrigacoesPorEntregador: Record<string, number> = {};
  for (const o of obrigRes.data ?? []) {
    const id = o.entregue_por as string | null;
    if (id) obrigacoesPorEntregador[id] = (obrigacoesPorEntregador[id] ?? 0) + 1;
  }

  const apontamentos = (apontRes.data ?? []).map((a) => ({
    usuario_id: a.usuario_id as string,
    cliente_id: (a.cliente_id as string | null) ?? null,
    minutos: Number(a.minutos),
  }));

  return agruparProdutividade({ equipe, apontamentos, tarefasPorResponsavel, obrigacoesPorEntregador });
}
