import { protegerRota } from "@/lib/api/rota";
import { erroJson, umJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { baixaSchema } from "@/lib/validation/api-escrita";
import { registrarBaixaNucleo } from "@/lib/financeiro/gravar-baixa";

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "titulos:write", async () => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = baixaSchema.safeParse({ ...body, tituloId: id });
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const r = await registrarBaixaNucleo(parsed.data, { db: createAdminSupabase(), autorId: null });
    if (!r.ok) return erroJson("erro", r.erro, 400);
    return umJson({ ok: true });
  });
}
