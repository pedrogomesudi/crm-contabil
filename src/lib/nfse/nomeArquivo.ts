// Sanitiza um texto (razão social) para virar nome de arquivo seguro: troca caracteres
// proibidos por "-", colapsa espaços e limita o tamanho.
export function sanitizarNomeArquivo(texto: string): string {
  return texto
    .replace(/[/\\:*?"<>|\n\r\t]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// Nome de arquivo seguro a partir da razão social, único dentro de um conjunto
// (evita sobrescrever quando um cliente tem mais de uma nota no mesmo ZIP).
// `usados` guarda os nomes já emitidos (em minúsculas) e é mutado.
export function nomeArquivoUnico(razao: string, usados: Set<string>): string {
  const base = sanitizarNomeArquivo(razao) || "SEM RAZAO SOCIAL";
  let nome = base;
  let i = 2;
  while (usados.has(nome.toLowerCase())) nome = `${base} (${i++})`;
  usados.add(nome.toLowerCase());
  return nome;
}

// Nome do arquivo do boleto: "boleto - {razão social}". Retorna "" se não houver razão,
// para o chamador cair no nome de reserva (por número).
export function nomeArquivoBoleto(razao: string): string {
  const base = sanitizarNomeArquivo(razao);
  return base ? `boleto - ${base}` : "";
}
