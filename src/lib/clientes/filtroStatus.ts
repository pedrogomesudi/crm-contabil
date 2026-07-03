// Filtro de status/exclusão da lista de clientes. Puro e testável: concentra a
// montagem do predicado para o teste cobrir sem tocar no Supabase.

export type FiltroStatus = "" | "ativo" | "inativo" | "excluido";

const VALIDOS: readonly FiltroStatus[] = ["", "ativo", "inativo", "excluido"];

// Normaliza a query string: qualquer valor fora do conjunto vira "" (default).
export function normalizarFiltro(v: string | undefined): FiltroStatus {
  return VALIDOS.includes(v as FiltroStatus) ? (v as FiltroStatus) : "";
}

// Contrato mínimo do PostgrestFilterBuilder usado aqui. Interface não-genérica
// (chamada via cast) para não disparar instanciação profunda ao inferir contra
// o tipo real, gigante, do builder do PostgREST (TS2589).
interface FiltroBuilder {
  eq(col: string, val: unknown): FiltroBuilder;
  is(col: string, val: unknown): FiltroBuilder;
  not(col: string, op: string, val: unknown): FiltroBuilder;
}

// Aplica o predicado ao builder e o devolve (preservando o tipo T de quem chama).
// Excluídos ficam escondidos, exceto no filtro "excluido".
export function aplicarFiltroStatus<T>(query: T, filtro: FiltroStatus): T {
  const q = query as unknown as FiltroBuilder;
  if (filtro === "excluido") return q.not("excluido_em", "is", null) as unknown as T;
  if (filtro === "ativo" || filtro === "inativo") {
    return q.eq("status", filtro).is("excluido_em", null) as unknown as T;
  }
  return q.is("excluido_em", null) as unknown as T;
}
