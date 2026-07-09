export function paraCSV(cabecalhos: string[], linhas: string[][]): string {
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const linha = (arr: string[]) => arr.map(esc).join(";");
  return [linha(cabecalhos), ...linhas.map(linha)].join("\r\n");
}
