"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeCriarCliente, podeRevelarCredencial } from "@/lib/clientes/permissoes";
import { cifrarSenha, decifrarSenha } from "@/lib/onboarding/credencial";
import { progressoOnboarding, type CategoriaOnb, type StatusOnb, type ItemOnb } from "@/lib/onboarding/progresso";

export type ItemClienteView = {
  id: string;
  categoria: CategoriaOnb;
  nome: string;
  obrigatorio: boolean;
  ordem: number;
  status: StatusOnb;
  responsavelId: string | null;
  prazo: string | null;
  observacao: string | null;
  acessoUrl: string | null;
  acessoLogin: string | null;
  temSenha: boolean;
};

export async function listarOnboardingCliente(clienteId: string): Promise<{ itens: ItemClienteView[]; progresso: ReturnType<typeof progressoOnboarding> } | null> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("onboarding_item")
    .select("id, categoria, nome, obrigatorio, ordem, status, responsavel_id, prazo, observacao, acesso_url, acesso_login, acesso_senha_cifrada")
    .eq("cliente_id", clienteId)
    .order("ordem");
  const itens: ItemClienteView[] = (data ?? []).map((r) => ({
    id: r.id as string,
    categoria: r.categoria as CategoriaOnb,
    nome: r.nome as string,
    obrigatorio: r.obrigatorio as boolean,
    ordem: r.ordem as number,
    status: r.status as StatusOnb,
    responsavelId: (r.responsavel_id as string | null) ?? null,
    prazo: (r.prazo as string | null) ?? null,
    observacao: (r.observacao as string | null) ?? null,
    acessoUrl: (r.acesso_url as string | null) ?? null,
    acessoLogin: (r.acesso_login as string | null) ?? null,
    temSenha: !!r.acesso_senha_cifrada,
  }));
  const itensProg: ItemOnb[] = itens.map((i) => ({ id: i.id, categoria: i.categoria, nome: i.nome, obrigatorio: i.obrigatorio, ordem: i.ordem, status: i.status, prazo: i.prazo }));
  return { itens, progresso: progressoOnboarding(itensProg) };
}

export async function iniciarOnboarding(clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("onboarding_item").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId);
  if ((count ?? 0) > 0) return { ok: true };
  const { data: modelo } = await supabase.from("onboarding_item_modelo").select("categoria, nome, obrigatorio, ordem").eq("ativo", true).order("ordem");
  if (!modelo || modelo.length === 0) return { erro: "Configure o checklist-modelo primeiro (Configurações → Checklist de onboarding)." };
  const linhas = modelo.map((m) => ({ cliente_id: clienteId, categoria: m.categoria, nome: m.nome, obrigatorio: m.obrigatorio, ordem: m.ordem }));
  const { error } = await supabase.from("onboarding_item").insert(linhas);
  if (error) return { erro: "Falha ao iniciar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function salvarItemOnboarding(input: {
  id?: string;
  clienteId: string;
  categoria: CategoriaOnb;
  nome: string;
  obrigatorio: boolean;
  status: StatusOnb;
  responsavelId: string | null;
  prazo: string | null;
  observacao: string | null;
  acessoUrl: string | null;
  acessoLogin: string | null;
  novaSenha?: string | null;
}): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const row: Record<string, unknown> = {
    cliente_id: input.clienteId,
    categoria: input.categoria,
    nome: input.nome,
    obrigatorio: input.obrigatorio,
    status: input.status,
    responsavel_id: input.responsavelId,
    prazo: input.prazo || null,
    observacao: input.observacao,
    acesso_url: input.acessoUrl,
    acesso_login: input.acessoLogin,
    atualizado_em: new Date().toISOString(),
    atualizado_por: p.id,
  };
  if (input.novaSenha) {
    try {
      row.acesso_senha_cifrada = cifrarSenha(input.novaSenha);
    } catch {
      return { erro: "Cofre de senhas não configurado (ONBOARDING_CRIPTO_KEY)." };
    }
  }
  const { error } = input.id
    ? await supabase.from("onboarding_item").update(row).eq("id", input.id)
    : await supabase.from("onboarding_item").insert(row);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath(`/clientes/${input.clienteId}`);
  return { ok: true };
}

export async function removerItemOnboarding(id: string, clienteId: string): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeCriarCliente(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("onboarding_item").delete().eq("id", id);
  if (error) return { erro: "Falha ao remover." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function revelarSenha(itemId: string): Promise<{ senha?: string; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeRevelarCredencial(p.papel)) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("onboarding_item").select("acesso_senha_cifrada").eq("id", itemId).maybeSingle();
  if (!data?.acesso_senha_cifrada) return { erro: "Sem senha cadastrada." };
  let senha: string;
  try {
    senha = decifrarSenha(data.acesso_senha_cifrada as string);
  } catch {
    return { erro: "Falha ao decifrar (chave?)." };
  }
  // Auditoria OBRIGATÓRIA (fail-closed): se não conseguir registrar quem revelou, não devolve a senha.
  const { error: logErr } = await supabase.from("onboarding_log_credencial").insert({ item_id: itemId, usuario_id: p.id });
  if (logErr) return { erro: "Não foi possível registrar a auditoria; revelação cancelada." };
  return { senha };
}
