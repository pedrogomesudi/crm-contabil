import { protegerRota } from "@/lib/api/rota";
import { umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarObrigacao, COLS_OBRIGACAO } from "@/lib/api/serializar";
import { obrigacaoBaixaSchema } from "@/lib/validation/api-escrita";
import { darBaixaObrigacaoNucleo } from "@/lib/obrigacoes/gravar-baixa";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "obrigacoes:read", async () => {
    const { id } = await ctx.params;
    const admin = createAdminSupabase();
    const { data } = await admin.from("obrigacao_instancia").select(COLS_OBRIGACAO).eq("id", id).maybeSingle();
    if (!data) return erroJson("nao_encontrado", "Obrigação não encontrada.", 404);
    return umJson(serializarObrigacao(data));
  });
}

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return protegerRota(req, "obrigacoes:write", async () => {
    const { id } = await ctx.params;
    const tipo = req.headers.get("content-type") ?? "";
    let campos: { data?: string; observacao?: string } = {};
    let comprovante: { bytes: Uint8Array; nome: string; mime: string } | null = null;
    if (tipo.includes("multipart/form-data")) {
      const fd = await req.formData();
      campos = {
        data: String(fd.get("data") ?? "") || undefined,
        observacao: String(fd.get("observacao") ?? "") || undefined,
      };
      const f = fd.get("comprovante");
      if (f instanceof File && f.size > 0)
        comprovante = { bytes: new Uint8Array(await f.arrayBuffer()), nome: f.name, mime: f.type };
    } else {
      campos = (await req.json().catch(() => ({}))) as { data?: string; observacao?: string };
    }
    const parsed = obrigacaoBaixaSchema.safeParse(campos);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const r = await darBaixaObrigacaoNucleo(
      { instanciaId: id, data: parsed.data.data, observacao: parsed.data.observacao ?? null, comprovante },
      { admin: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson("erro", r.erro, 400);
    return umJson({ ok: true });
  });
}
