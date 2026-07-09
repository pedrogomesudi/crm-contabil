// Neutraliza injeção de fórmula (CSV/Excel): células iniciadas por = + @ (ou tab/CR) são
// interpretadas como fórmula ao abrir na planilha. Prefixa com ' para forçar texto. Números
// negativos (-12,50) são preservados; só neutraliza "-" seguido de não-dígito.
function neutralizarFormula(v: string): string {
  if (/^[=+@\t\r]/.test(v) || (v.startsWith("-") && !/^-\d/.test(v))) return "'" + v;
  return v;
}

export function paraCSV(cabecalhos: string[], linhas: string[][]): string {
  const esc = (valor: string) => {
    const v = neutralizarFormula(valor);
    return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const linha = (arr: string[]) => arr.map(esc).join(";");
  return [linha(cabecalhos), ...linhas.map(linha)].join("\r\n");
}
