import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson, umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarCliente, COLS_CLIENTE } from "@/lib/api/serializar";
import { clienteSchema } from "@/lib/validation/cliente";
import { criarClienteNucleo } from "@/lib/clientes/gravar";

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

export function POST(req: Request) {
  return protegerRota(req, "clientes:write", async () => {
    const body = (await req.json().catch(() => null)) as { endereco?: unknown } | null;
    const parsed = clienteSchema.safeParse(body);
    if (!parsed.success) return erroJson("validacao", parsed.error.issues[0]?.message ?? "Payload inválido.", 422);
    const endereco =
      body?.endereco && typeof body.endereco === "object" ? (body.endereco as Record<string, string>) : null;
    const r = await criarClienteNucleo(
      { dados: parsed.data, endereco, representante: null, camposCustom: {} },
      { db: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson(r.codigo, r.erro, r.codigo === "duplicado" ? 409 : 400);
    return umJson({ id: r.id });
  });
}
