import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson, umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarTitulo, COLS_TITULO } from "@/lib/api/serializar";
import { tituloAvulsoSchema } from "@/lib/validation/api-escrita";
import { criarTituloAvulsoNucleo } from "@/lib/financeiro/gravar-titulo";

export function GET(req: Request) {
  return protegerRota(req, "titulos:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("titulo")
      .select(COLS_TITULO, { count: "exact" })
      .order("vencimento", { ascending: false })
      .range(offset, offset + limit - 1);
    const clienteId = url.searchParams.get("cliente_id");
    const status = url.searchParams.get("status");
    const competencia = url.searchParams.get("competencia");
    const tipo = url.searchParams.get("tipo");
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (status) q = q.eq("status", status);
    if (competencia) q = q.eq("competencia", competencia);
    if (tipo) q = q.eq("tipo", tipo);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarTitulo), { limit, offset, total: count ?? 0 });
  });
}

export function POST(req: Request) {
  return protegerRota(req, "titulos:write", async () => {
    const body = await req.json().catch(() => null);
    const parsed = tituloAvulsoSchema.safeParse(body);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const r = await criarTituloAvulsoNucleo(parsed.data, { db: createAdminSupabase(), autorId: null });
    if (!r.ok) return erroJson(r.codigo, r.erro, r.codigo === "duplicado" ? 409 : 400);
    return umJson({ id: r.tituloId });
  });
}
