export type EntradaAvulsa = { clienteId: string; valor: number; vencimento: string; categoriaId: string };

// Competência da receita avulsa: mês do vencimento, dia 01 (padrão da conciliação).
export function competenciaDoVencimento(vencimento: string): string {
  return `${vencimento.slice(0, 7)}-01`;
}

export function validarCobrancaAvulsa(e: EntradaAvulsa): { ok: true } | { ok: false; erro: string } {
  if (!e.clienteId) return { ok: false, erro: "Selecione o cliente." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.vencimento)) return { ok: false, erro: "Vencimento inválido." };
  if (!(e.valor > 0)) return { ok: false, erro: "Informe um valor maior que zero." };
  if (!e.categoriaId) return { ok: false, erro: "Selecione a categoria." };
  return { ok: true };
}
