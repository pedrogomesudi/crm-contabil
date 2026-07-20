function nomeSeguro(nome: string): string {
  const semAcento = nome.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const limpo = semAcento
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .replace(/[._]+$/, "");
  return limpo.length > 0 ? limpo.slice(0, 100) : "arquivo";
}

// Entrada única para o ZIP: prefixa por índice (1-based) para evitar colisão de nomes iguais.
export function nomeEntradaZip(nome: string, i: number): string {
  return `${i + 1}-${nomeSeguro(nome)}`;
}
