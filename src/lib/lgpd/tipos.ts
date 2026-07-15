// Rótulos das bases legais da LGPD (art. 7 e 11), compartilhados entre telas.
export const BASES_LEGAIS: { valor: string; rotulo: string }[] = [
  { valor: "consentimento", rotulo: "Consentimento (art. 7, I)" },
  { valor: "contrato", rotulo: "Execução de contrato (art. 7, V)" },
  { valor: "obrigacao_legal", rotulo: "Obrigação legal (art. 7, II)" },
  { valor: "legitimo_interesse", rotulo: "Legítimo interesse (art. 7, IX)" },
  { valor: "protecao_credito", rotulo: "Proteção ao crédito (art. 7, X)" },
  { valor: "exercicio_direitos", rotulo: "Exercício de direitos (art. 7, VI)" },
];

export function rotuloBaseLegal(v: string): string {
  return BASES_LEGAIS.find((b) => b.valor === v)?.rotulo ?? v;
}

// Baixa um arquivo a partir de base64 (o padrão de download do projeto).
export function baixarBase64(base64: string, nome: string, mime: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
