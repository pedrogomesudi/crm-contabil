// Filtro de status/exclusão da lista de clientes. Puro e testável: concentra a
// montagem do predicado para o teste cobrir sem tocar no Supabase.

export type FiltroStatus = "" | "ativo" | "inativo" | "excluido";

const VALIDOS: readonly FiltroStatus[] = ["", "ativo", "inativo", "excluido"];

// Normaliza a query string: qualquer valor fora do conjunto vira "" (default).
export function normalizarFiltro(v: string | undefined): FiltroStatus {
  return VALIDOS.includes(v as FiltroStatus) ? (v as FiltroStatus) : "";
}

// Contrato mínimo do PostgrestFilterBuilder usado aqui.
type Builder<T> = T & {
  eq(col: string, val: unknown): Builder<T>;
  is(col: string, val: unknown): Builder<T>;
  not(col: string, op: string, val: unknown): Builder<T>;
};

// Aplica o predicado ao builder e o devolve. Excluídos ficam escondidos, exceto
// no filtro "excluido".
export function aplicarFiltroStatus<T>(query: Builder<T>, filtro: FiltroStatus): Builder<T> {
  if (filtro === "excluido") return query.not("excluido_em", "is", null);
  if (filtro === "ativo" || filtro === "inativo") {
    return query.eq("status", filtro).is("excluido_em", null);
  }
  return query.is("excluido_em", null);
}
