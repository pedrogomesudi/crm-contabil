type ErroEntrada = { message?: unknown; stack?: unknown; digest?: unknown };
type RequestEntrada = { path?: unknown; method?: unknown };
type ContextEntrada = {
  routerKind?: unknown;
  routePath?: unknown;
  routeType?: unknown;
  renderSource?: unknown;
  revalidateReason?: unknown;
  renderType?: unknown;
};

export type EventoErroLinha = {
  mensagem: string;
  rota: string | null;
  metodo: string | null;
  digest: string | null;
  tipo_rota: string | null;
  stack: string | null;
  contexto: Record<string, unknown>;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function corta(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

// Normaliza o erro capturado pelo onRequestError do Next numa linha de evento_erro. Defensivo:
// a origem é a borda do framework, então tudo é `unknown` e nada aqui pode lançar. Não inclui
// criado_em — o default do banco cobre.
export function montarEventoErro(
  err: ErroEntrada | null | undefined,
  request: RequestEntrada | null | undefined,
  context: ContextEntrada | null | undefined,
): EventoErroLinha {
  const e = err ?? {};
  const r = request ?? {};
  const c = context ?? {};
  const contexto: Record<string, unknown> = {};
  for (const k of ["routerKind", "routePath", "renderSource", "revalidateReason", "renderType"] as const) {
    if (c[k] !== undefined && c[k] !== null) contexto[k] = c[k];
  }
  return {
    mensagem: corta(e.message, 2000) ?? "(sem mensagem)",
    rota: str(r.path),
    metodo: str(r.method),
    digest: str(e.digest),
    tipo_rota: str(c.routeType),
    stack: corta(e.stack, 6000),
    contexto,
  };
}
