import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarCliente, COLS_CLIENTE } from "@/lib/api/serializar";

export function GET(req: Request) {
  return protegerRota(req, "clientes:read", async () => {
    const url = new URL(req.url);
    const { limit, offset } = normalizarPaginacao(url.searchParams.get("limit"), url.searchParams.get("offset"));
    const admin = createAdminSupabase();
    let q = admin
      .from("clientes")
      .select(COLS_CLIENTE, { count: "exact" })
      .is("excluido_em", null)
      .order("razao_social")
      .range(offset, offset + limit - 1);
    const cpf = url.searchParams.get("cpf_cnpj");
    const status = url.searchParams.get("status");
    if (cpf) q = q.eq("cpf_cnpj", cpf.replace(/\D/g, ""));
    if (status) q = q.eq("status", status);
    const { data, count } = await q;
    return okJson((data ?? []).map(serializarCliente), { limit, offset, total: count ?? 0 });
  });
}
