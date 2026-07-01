import extenso from "extenso";

// "Reais por extenso" (ex.: 1452.5 -> "mil quatrocentos e cinquenta e dois reais
// e cinquenta centavos"). A lib aceita o número com vírgula decimal.
export function reaisPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return "";
  const txt = valor.toFixed(2).replace(".", ",");
  try {
    return extenso(txt, { mode: "currency" });
  } catch {
    return "";
  }
}
