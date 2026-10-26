// Paginação de listas renderizadas no servidor: a página vive na URL (?pagina=N), então o
// link é compartilhável e o botão "voltar" do navegador funciona.

export function totalPaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / porPagina));
}

// A página vem da URL, ou seja, de entrada arbitrária: qualquer coisa que não seja um inteiro
// dentro do intervalo vira a borda mais próxima, em vez de derrubar a tela ou devolver vazio.
export function paginaValida(bruta: unknown, totalPags: number): number {
  const n = typeof bruta === "string" && /^\d+$/.test(bruta) ? Number(bruta) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, totalPags);
}

// Range do Supabase: inclusivo nas duas pontas.
export function intervaloPagina(pagina: number, porPagina: number): { de: number; ate: number } {
  const de = (pagina - 1) * porPagina;
  return { de, ate: de + porPagina - 1 };
}
