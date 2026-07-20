"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { elegivelSuspensao, podeSuspender, podeReativar, motivoValido } from "@/lib/financeiro/suspensao";

export type ClienteSuspensao = {
  clienteId: string;
  cliente: string;
  saldoDevedor: number;
  diasAtraso: number;
  suspenso: boolean;
};
export type ListaSuspensao = {
  papel: string;
  sugeridos: ClienteSuspensao[];
  suspensos: ClienteSuspensao[];
  reativaveis: ClienteSuspensao[];
};

type Row = { cliente_id: string; cliente: string; saldo_devedor: number; dias_atraso: number; suspenso: boolean };

export async function listarSuspensao(): Promise<ListaSuspensao | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;
  const supabase = await createServerSupabase();
  const [{ data: rows }, { data: cfg }] = await Promise.all([
    supabase.rpc("financeiro_suspensao_candidatos"),
    supabase
      .from("escritorio_config")
      .select("suspensao_dias_tolerancia, suspensao_valor_minimo")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  const dias = (cfg?.suspensao_dias_tolerancia as number | null) ?? null;
  const piso = (cfg?.suspensao_valor_minimo as number | null) ?? null;
  const itens: ClienteSuspensao[] = ((rows ?? []) as Row[]).map((r) => ({
    clienteId: r.cliente_id,
    cliente: r.cliente,
    saldoDevedor: Number(r.saldo_devedor),
    diasAtraso: Number(r.dias_atraso),
    suspenso: r.suspenso,
  }));
  return {
    papel: perfil.papel,
    sugeridos: itens.filter((i) => !i.suspenso && elegivelSuspensao(i.diasAtraso, i.saldoDevedor, dias, piso)),
    suspensos: itens.filter((i) => i.suspenso && i.saldoDevedor > 0),
    reativaveis: itens.filter((i) => i.suspenso && i.saldoDevedor <= 0),
  };
}

export async function suspenderCliente(clienteId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeSuspender(perfil.papel)) return { erro: "Sem permissão para suspender." };
  if (!motivoValido(motivo)) return { erro: "Informe o motivo da suspensão." };
  const supabase = await createServerSupabase();
  const { data: rows } = await supabase.rpc("financeiro_suspensao_candidatos");
  const row = ((rows ?? []) as Row[]).find((r) => r.cliente_id === clienteId);
  if (!row) return { erro: "Cliente não encontrado na fila." };
  if (row.suspenso) return { erro: "Cliente já está suspenso." };
  const admin = createAdminSupabase();
  await admin.from("clientes").update({ suspenso: true }).eq("id", clienteId);
  await admin.from("contrato").update({ status: "SUSPENSO" }).eq("cliente_id", clienteId).eq("status", "ATIVO");
  await admin.from("cliente_suspensao").insert({
    cliente_id: clienteId,
    acao: "suspensao",
    motivo: motivo.trim(),
    saldo_devedor: Number(row.saldo_devedor),
    dias_atraso: Number(row.dias_atraso),
    por: perfil.id,
  });
  revalidatePath("/financeiro/inadimplencia");
  return { ok: true };
}

export async function reativarCliente(clienteId: string, motivo: string): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeReativar(perfil.papel)) return { erro: "Só um admin pode reativar." };
  if (!motivoValido(motivo)) return { erro: "Informe o motivo da reativação." };
  const admin = createAdminSupabase();
  await admin.from("clientes").update({ suspenso: false }).eq("id", clienteId);
  await admin.from("contrato").update({ status: "ATIVO" }).eq("cliente_id", clienteId).eq("status", "SUSPENSO");
  await admin.from("cliente_suspensao").insert({
    cliente_id: clienteId,
    acao: "reativacao",
    motivo: motivo.trim(),
    por: perfil.id,
  });
  revalidatePath("/financeiro/inadimplencia");
  return { ok: true };
}
