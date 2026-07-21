import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarObrigacao, COLS_OBRIGACAO } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "obrigacoes:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("obrigacao_instancia")
      .select(COLS_OBRIGACAO, { count: "exact" })
      .order("vencimento_legal", { ascending: false })
      .range(offset, offset + limit - 1);
    const clienteId = url.searchParams.get("cliente_id");
    const competencia = url.searchParams.get("competencia");
    const entregue = url.searchParams.get("entregue"); // "true" | "false"
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (competencia) q = q.eq("competencia", competencia);
    if (entregue === "true") q = q.not("entregue_em", "is", null);
    if (entregue === "false") q = q.is("entregue_em", null);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarObrigacao), { limit, offset, total: count ?? 0 });
  });
}
