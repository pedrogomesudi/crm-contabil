"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

const COLUNA = { folha: "flag_tem_folha", icms: "flag_contribui_icms", iss: "flag_contribui_iss" } as const;

export async function salvarFlagFiscal(
  clienteId: string,
  campo: "folha" | "icms" | "iss",
  valor: boolean | null,
): Promise<{ erro?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("clientes")
    .update({ [COLUNA[campo]]: valor })
    .eq("id", clienteId);
  if (error) return { erro: "Não foi possível salvar a flag (sem permissão?)." };
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}
