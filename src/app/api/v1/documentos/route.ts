import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarDocumento, COLS_DOCUMENTO } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "documentos:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("documentos")
      .select(COLS_DOCUMENTO, { count: "exact" })
      .order("enviado_em", { ascending: false })
      .range(offset, offset + limit - 1);
    const clienteId = url.searchParams.get("cliente_id");
    const tipo = url.searchParams.get("tipo");
    const competencia = url.searchParams.get("competencia");
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (tipo) q = q.eq("tipo", tipo);
    if (competencia) q = q.eq("competencia", competencia);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarDocumento), { limit, offset, total: count ?? 0 });
  });
}
