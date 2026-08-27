"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { formatarDocumento } from "@/lib/format";

const ROTA = "/financeiro/grupos-cobranca";

export type MembroView = {
  clienteId: string;
  razaoSocial: string;
  documento: string;
  honorario: number;
  titular: boolean;
};
export type GrupoView = {
  id: string;
  nome: string;
  titularClienteId: string;
  membros: MembroView[];
  total: number;
};

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}
function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listarGrupos(): Promise<GrupoView[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data: grupos } = await supabase.from("grupo_cobranca").select("id, nome, titular_cliente_id").order("nome");
  if (!grupos?.length) return [];
  const { data: membros } = await supabase
    .from("clientes")
    .select("id, razao_social, cpf_cnpj, grupo_cobranca_id, clientes_financeiro(honorario_mensal)")
    .in(
      "grupo_cobranca_id",
      grupos.map((g) => g.id),
    )
    .eq("status", "ativo")
    .is("excluido_em", null)
    .order("razao_social");
  return grupos.map((g) => {
    const ms = (membros ?? [])
      .filter((m) => m.grupo_cobranca_id === g.id)
      .map((m) => {
        const fin = um(m.clientes_financeiro) as { honorario_mensal?: number } | null;
        return {
          clienteId: m.id as string,
          razaoSocial: (m.razao_social as string) ?? "—",
          documento: m.cpf_cnpj ? formatarDocumento(m.cpf_cnpj as string) : "—",
          honorario: Number(fin?.honorario_mensal ?? 0),
          titular: m.id === g.titular_cliente_id,
        };
      });
    return {
      id: g.id as string,
      nome: g.nome as string,
      titularClienteId: g.titular_cliente_id as string,
      membros: ms,
      total: ms.reduce((s, m) => s + m.honorario, 0),
    };
  });
}

export async function listarClientesSemGrupo(): Promise<{ id: string; nome: string }[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("clientes")
    .select("id, razao_social")
    .eq("status", "ativo")
    .is("excluido_em", null)
    .is("grupo_cobranca_id", null)
    .order("razao_social");
  return (data ?? []).map((c) => ({ id: c.id as string, nome: (c.razao_social as string) ?? "—" }));
}

// Cria o grupo com a titular já como primeiro membro.
export async function criarGrupo(nome: string, titularClienteId: string): Promise<{ erro?: string; id?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!nome.trim()) return { erro: "Informe o nome do grupo." };
  if (!titularClienteId) return { erro: "Selecione a empresa titular." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("grupo_cobranca")
    .insert({ nome: nome.trim(), titular_cliente_id: titularClienteId })
    .select("id")
    .single();
  if (error || !data) return { erro: "Falha ao criar o grupo." };
  const grupoId = data.id as string;
  await supabase.from("clientes").update({ grupo_cobranca_id: grupoId }).eq("id", titularClienteId);
  revalidatePath(ROTA);
  return { id: grupoId };
}

export async function renomearGrupo(grupoId: string, nome: string): Promise<{ erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!nome.trim()) return { erro: "Informe o nome do grupo." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("grupo_cobranca").update({ nome: nome.trim() }).eq("id", grupoId);
  if (error) return { erro: "Falha ao renomear." };
  revalidatePath(ROTA);
  return {};
}

// Adiciona um cliente ao grupo (sai automaticamente de qualquer grupo anterior).
export async function adicionarMembro(grupoId: string, clienteId: string): Promise<{ erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clientes").update({ grupo_cobranca_id: grupoId }).eq("id", clienteId);
  if (error) return { erro: "Falha ao adicionar a empresa." };
  revalidatePath(ROTA);
  return {};
}

// Remove um membro do grupo. A titular não pode ser removida sem antes trocar a titular.
export async function removerMembro(clienteId: string): Promise<{ erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: titularDe } = await supabase.from("grupo_cobranca").select("id").eq("titular_cliente_id", clienteId);
  if (titularDe?.length) return { erro: "Esta empresa é a titular do grupo. Troque a titular antes de removê-la." };
  const { error } = await supabase.from("clientes").update({ grupo_cobranca_id: null }).eq("id", clienteId);
  if (error) return { erro: "Falha ao remover a empresa." };
  revalidatePath(ROTA);
  return {};
}

// Troca a titular do grupo. O cliente escolhido precisa já ser membro do grupo.
export async function definirTitular(grupoId: string, clienteId: string): Promise<{ erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: cli } = await supabase.from("clientes").select("grupo_cobranca_id").eq("id", clienteId).maybeSingle();
  if (!cli || cli.grupo_cobranca_id !== grupoId) return { erro: "A titular precisa ser uma empresa do grupo." };
  const { error } = await supabase.from("grupo_cobranca").update({ titular_cliente_id: clienteId }).eq("id", grupoId);
  if (error) return { erro: "Falha ao definir a titular." };
  revalidatePath(ROTA);
  return {};
}

export async function excluirGrupo(grupoId: string): Promise<{ erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  await supabase.from("clientes").update({ grupo_cobranca_id: null }).eq("grupo_cobranca_id", grupoId);
  const { error } = await supabase.from("grupo_cobranca").delete().eq("id", grupoId);
  if (error) return { erro: "Falha ao excluir (há boletos vinculados?)." };
  revalidatePath(ROTA);
  return {};
}
