import "server-only";
import { cache } from "react";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { moduloAtivo, planoDe, type Modulo, type Plano } from "./planos";

// Plano da instância (escritorio_config.plano). Lido via admin porque é config global da
// instância (id=1), não dado por cliente — e precisa ser confiável para o gating. cache() dedup
// por request (várias chamadas no mesmo render pagam uma leitura só).
export const planoAtual = cache(async (): Promise<Plano> => {
  const admin = createAdminSupabase();
  const { data } = await admin.from("escritorio_config").select("plano").eq("id", 1).maybeSingle();
  return planoDe(data?.plano);
});

// Guard de rota: usar no topo do page/layout de um módulo gateável. Se o plano da instância não
// libera o módulo, manda para a Início (defesa contra acesso por URL direta, além do menu).
export async function exigirModulo(modulo: Modulo): Promise<void> {
  const plano = await planoAtual();
  if (!moduloAtivo(plano, modulo)) redirect("/");
}
