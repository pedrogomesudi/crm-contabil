// Nome de arquivo seguro a partir da razão social, único dentro de um conjunto
// (evita sobrescrever quando um cliente tem mais de uma nota no mesmo ZIP).
// `usados` guarda os nomes já emitidos (em minúsculas) e é mutado.
export function nomeArquivoUnico(razao: string, usados: Set<string>): string {
  const base =
    razao
      .replace(/[/\\:*?"<>|\n\r\t]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "SEM RAZAO SOCIAL";
  let nome = base;
  let i = 2;
  while (usados.has(nome.toLowerCase())) nome = `${base} (${i++})`;
  usados.add(nome.toLowerCase());
  return nome;
}
