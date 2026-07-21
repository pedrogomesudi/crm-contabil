import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarObrigacao, COLS_OBRIGACAO } from "@/lib/api/serializar";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "obrigacoes:read", async () => {
    const { id } = await ctx.params;
    const admin = createAdminSupabase();
    const { data } = await admin.from("obrigacao_instancia").select(COLS_OBRIGACAO).eq("id", id).maybeSingle();
    if (!data) return erroJson("nao_encontrado", "Obrigação não encontrada.", 404);
    return umJson(serializarObrigacao(data));
  });
}
