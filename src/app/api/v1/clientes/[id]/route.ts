import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarCliente, COLS_CLIENTE } from "@/lib/api/serializar";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "clientes:read", async () => {
    const { id } = await ctx.params;
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("clientes")
      .select(COLS_CLIENTE)
      .eq("id", id)
      .is("excluido_em", null)
      .maybeSingle();
    if (!data) return erroJson("nao_encontrado", "Cliente não encontrado.", 404);
    return umJson(serializarCliente(data));
  });
}
