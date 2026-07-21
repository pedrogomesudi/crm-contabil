import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarCliente, COLS_CLIENTE } from "@/lib/api/serializar";
import { clienteSchema } from "@/lib/validation/cliente";
import { atualizarClienteNucleo } from "@/lib/clientes/gravar";

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

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "clientes:write", async () => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { atualizado_em?: unknown; endereco?: unknown } | null;
    const atualizadoEm = String(body?.atualizado_em ?? "");
    if (!atualizadoEm) return erroJson("precondicao", "Envie 'atualizado_em' (controle de concorrência).", 428);
    const parsed = clienteSchema.safeParse(body);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const endereco =
      body?.endereco && typeof body.endereco === "object" ? (body.endereco as Record<string, string>) : null;
    const r = await atualizarClienteNucleo(
      id,
      { dados: parsed.data, endereco, representante: null, camposCustom: {}, atualizadoEmEsperado: atualizadoEm },
      { db: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson(r.codigo, r.erro, r.codigo === "conflito" || r.codigo === "duplicado" ? 409 : 400);
    return umJson({ ok: true });
  });
}
