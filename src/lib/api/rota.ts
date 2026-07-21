import { autenticarApiKey, type AutenticacaoApi } from "./auth";
import { verificarRate } from "./rate-limit";
import { erroJson } from "./http";

// Envelope de toda rota /api/v1: autentica (Fatia A) + rate limit + captura de erro.
export async function protegerRota(
  req: Request,
  escopo: string,
  fn: (auth: AutenticacaoApi) => Promise<Response>,
): Promise<Response> {
  const a = await autenticarApiKey(req, escopo);
  if (!a.auth) return erroJson("nao_autorizado", a.erro ?? "Não autorizado.", a.status ?? 401);
  const rl = verificarRate(a.auth.id);
  if (!rl.permitido) {
    return erroJson("rate_limit", "Muitas requisições — tente em instantes.", 429, {
      "Retry-After": String(Math.ceil(rl.restanteMs / 1000)),
    });
  }
  try {
    return await fn(a.auth);
  } catch (e) {
    console.error("API v1:", e instanceof Error ? e.message : e);
    return erroJson("erro_interno", "Erro ao processar a requisição.", 500);
  }
}
