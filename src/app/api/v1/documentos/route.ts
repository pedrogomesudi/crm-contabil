import { protegerRota } from "@/lib/api/rota";
import { normalizarPaginacao, okJson, umJson, erroJson } from "@/lib/api/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serializarDocumento, COLS_DOCUMENTO } from "@/lib/api/serializar";
import { anexarDocumentoNucleo } from "@/lib/documentos/gravar";

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

export function POST(req: Request) {
  return protegerRota(req, "documentos:write", async () => {
    const tipo = req.headers.get("content-type") ?? "";
    if (!tipo.includes("multipart/form-data")) return erroJson("validacao", "Envie multipart/form-data.", 415);
    const fd = await req.formData();
    const clienteId = String(fd.get("cliente_id") ?? "");
    const f = fd.get("arquivo");
    if (!clienteId) return erroJson("validacao", "cliente_id é obrigatório.", 422);
    if (!(f instanceof File) || f.size === 0) return erroJson("validacao", "arquivo é obrigatório.", 422);
    const r = await anexarDocumentoNucleo(
      {
        clienteId,
        arquivo: { bytes: new Uint8Array(await f.arrayBuffer()), nome: f.name, mime: f.type },
        tipoId: String(fd.get("tipo_id") ?? "") || null,
        departamentoManual: String(fd.get("departamento") ?? ""),
        competenciaRaw: String(fd.get("competencia") ?? ""),
        tipoTextoLivre: String(fd.get("tipo") ?? ""),
      },
      { admin: createAdminSupabase(), autorId: null },
    );
    if (!r.ok) return erroJson("erro", r.erro, 400);
    return umJson({ id: r.id });
  });
}
