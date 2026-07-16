// Busca textual da lista de clientes. Puro e testável, e — mais importante —
// compartilhado entre a tela e a exportação: se as duas montassem o filtro por
// conta própria, o arquivo exportado acabaria divergindo do que está na tela.

// Escapa os curingas de LIKE para que % e _ digitados sejam literais.
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

// Só dígitos e pontuação de documento (./-) => busca por CPF/CNPJ; senão, razão social.
export function alvoDaBusca(q: string): { coluna: "cpf_cnpj" | "razao_social"; termo: string } {
  const digits = q.replace(/\D/g, "");
  const pareceDocumento = /^[\d.\-/\s]+$/.test(q) && digits.length >= 3;
  return pareceDocumento
    ? { coluna: "cpf_cnpj", termo: escapeLike(digits) }
    : { coluna: "razao_social", termo: escapeLike(q) };
}

// Contrato mínimo do builder do PostgREST (mesmo motivo de filtroStatus.ts: o
// tipo real é gigante e dispara TS2589 na inferência).
interface BuscaBuilder {
  ilike(col: string, pattern: string): BuscaBuilder;
}

export function aplicarBusca<T>(query: T, q: string): T {
  if (!q) return query;
  const { coluna, termo } = alvoDaBusca(q);
  return (query as BuscaBuilder).ilike(coluna, `%${termo}%`) as T;
}
