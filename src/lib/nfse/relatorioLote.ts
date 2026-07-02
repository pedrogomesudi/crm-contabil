import type { LinhaRelatorio } from "./tipos";

const CABECALHO = [
  "Cliente",
  "CNPJ/CPF",
  "Competência",
  "Valor",
  "Resultado",
  "Número",
  "Chave de acesso",
  "Motivo",
];

// Gatilhos de fórmula (Excel/Sheets): valor começando com estes executaria fórmula.
const FORMULA = /^[=+\-@\t\r]/;

function campo(v: string): string {
  let s = v;
  if (FORMULA.test(s)) s = "'" + s; // neutraliza a fórmula (CSV injection)
  // Escapa se contiver vírgula, aspas ou quebra de linha (RFC 4180).
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function montarCsv(linhas: LinhaRelatorio[]): string {
  const linhasTexto = linhas.map((l) =>
    [l.cliente, l.documento, l.competencia, l.valor.toFixed(2), l.resultado, l.numero, l.chave, l.motivo]
      .map((c) => campo(String(c)))
      .join(","),
  );
  return [CABECALHO.join(","), ...linhasTexto].join("\n") + "\n";
}
