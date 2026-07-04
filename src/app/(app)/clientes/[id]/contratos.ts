"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";

export type Contrato = {
  id: string;
  descricao: string;
  valor_mensal: number;
  dia_vencimento: number;
  data_inicio: string;
  gera_decimo_terceiro: boolean;
  mes_decimo_terceiro: number;
  status: string;
  categoria_id: string | null;
  centro_custo_id: string | null;
};
export type EstadoContrato = { erro?: string; ok?: boolean };

async function gate() {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeVerHonorario(perfil.papel)) return null;
  return perfil;
}

export async function listarContratos(clienteId: string): Promise<Contrato[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("contrato")
    .select(
      "id, descricao, valor_mensal, dia_vencimento, data_inicio, gera_decimo_terceiro, mes_decimo_terceiro, status, categoria_id, centro_custo_id",
    )
    .eq("cliente_id", clienteId)
    .order("criado_em");
  return (data ?? []) as Contrato[];
}

export async function salvarContrato(
  clienteId: string,
  _prev: EstadoContrato,
  fd: FormData,
): Promise<EstadoContrato> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const descricao = String(fd.get("descricao") ?? "").trim();
  const valor = Number(fd.get("valor_mensal") ?? 0);
  const dia = Number(fd.get("dia_vencimento") ?? 0);
  const dataInicio = String(fd.get("data_inicio") ?? "").trim();
  if (!descricao || !(valor > 0) || !(dia >= 1 && dia <= 28) || !dataInicio) {
    return { erro: "Preencha descrição, valor (>0), dia (1–28) e início." };
  }
  const registro = {
    cliente_id: clienteId,
    descricao,
    valor_mensal: valor,
    dia_vencimento: dia,
    data_inicio: dataInicio,
    gera_decimo_terceiro: fd.get("gera_decimo_terceiro") === "on",
    mes_decimo_terceiro: Number(fd.get("mes_decimo_terceiro") ?? 12) || 12,
    categoria_id: String(fd.get("categoria_id") ?? "").trim() || null,
    centro_custo_id: String(fd.get("centro_custo_id") ?? "").trim() || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };
  const id = String(fd.get("id") ?? "").trim();
  const supabase = await createServerSupabase();
  const { error } = id
    ? await supabase.from("contrato").update(registro).eq("id", id)
    : await supabase.from("contrato").insert({ ...registro, criado_por: perfil.id });
  if (error) return { erro: "Falha ao salvar o contrato." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function encerrarContrato(
  contratoId: string,
  clienteId: string,
  data: string,
  motivo: string,
): Promise<EstadoContrato> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("encerrar_contrato", {
    p_id: contratoId,
    p_data: data || new Date().toISOString().slice(0, 10),
    p_motivo: motivo || "",
  });
  if (error) return { erro: "Falha ao encerrar." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
