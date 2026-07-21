import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { hashChave, temEscopo } from "./chave";

export type AutenticacaoApi = { id: string; escopos: string[] };

// Autentica uma requisição da API pública por API key (Bearer). Roda com service_role: a API
// não tem sessão; o controle de acesso é o escopo. Retorna { auth } ou { status, erro }.
export async function autenticarApiKey(
  req: Request,
  escopo?: string,
): Promise<{ auth?: AutenticacaoApi; status?: number; erro?: string }> {
  const header = req.headers.get("authorization") ?? "";
  const chave = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!chave) return { status: 401, erro: "API key ausente (use Authorization: Bearer)." };

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("api_key")
    .select("id, escopos, ultimo_uso")
    .eq("key_hash", hashChave(chave))
    .is("revogada_em", null)
    .maybeSingle();
  if (!data) return { status: 401, erro: "API key inválida ou revogada." };

  const escopos = (data.escopos as string[] | null) ?? [];
  if (!temEscopo(escopos, escopo)) return { status: 403, erro: `Escopo necessário: ${escopo}.` };

  // ultimo_uso best-effort, no máx 1x/min (evita um write por request).
  const ultimo = data.ultimo_uso ? Date.parse(data.ultimo_uso as string) : 0;
  if (Date.now() - ultimo > 60000) {
    await admin.from("api_key").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id);
  }
  return { auth: { id: data.id as string, escopos } };
}
