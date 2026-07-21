import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarBoleto, COLS_BOLETO } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "titulos:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("boleto")
      .select(COLS_BOLETO, { count: "exact" })
      .order("vencimento", { ascending: false })
      .range(offset, offset + limit - 1);
    const tituloId = url.searchParams.get("titulo_id");
    const status = url.searchParams.get("status");
    if (tituloId) q = q.eq("titulo_id", tituloId);
    if (status) q = q.eq("status", status);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarBoleto), { limit, offset, total: count ?? 0 });
  });
}
