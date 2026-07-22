// Valida a nova data de vencimento de um boleto (formato YYYY-MM-DD). Puro e determinístico:
// recebe `hojeISO` por parâmetro. Regras: formato + data real; ≥ hoje; ≠ vencimento atual.
export function validarNovaVencimento(
  novaData: string,
  vencimentoAtual: string,
  hojeISO: string,
): { ok: true } | { erro: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { erro: "Data inválida." };
  // Data precisa existir no calendário: o round-trip por Date pega 2026-02-30, 2026-13-40 etc.
  const d = new Date(`${novaData}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== novaData) return { erro: "Data inválida." };
  // Comparação lexicográfica de datas ISO equivale à cronológica.
  if (novaData < hojeISO) return { erro: "A nova data não pode ser anterior a hoje." };
  if (novaData === vencimentoAtual) return { erro: "A nova data é igual à atual." };
  return { ok: true };
}
