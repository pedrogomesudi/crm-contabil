import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarTitulo, COLS_TITULO } from "@/lib/api/serializar";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "titulos:read", async () => {
    const { id } = await ctx.params;
    const admin = createAdminSupabase();
    const { data } = await admin.from("titulo").select(COLS_TITULO).eq("id", id).maybeSingle();
    if (!data) return erroJson("nao_encontrado", "Título não encontrado.", 404);
    return umJson(serializarTitulo(data));
  });
}
