"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Departamento } from "@/lib/clientes/departamentos";

export async function salvarSlaDepartamento(
  departamento: Departamento,
  dias: number,
): Promise<{ ok?: boolean; erro?: string }> {
  const p = await getPerfilAtual();
  if (!p?.ativo || p.papel !== "admin") return { erro: "Apenas admin." };
  if (!Number.isInteger(dias) || dias < 0 || dias > 60) return { erro: "Informe de 0 a 60 dias." };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("departamento_sla")
    .upsert({ departamento, dias }, { onConflict: "departamento" });
  if (error) return { erro: "Falha ao salvar o SLA." };
  revalidatePath("/configuracoes/sla");
  return { ok: true };
}
