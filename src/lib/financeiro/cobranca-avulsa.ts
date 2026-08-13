export type EntradaAvulsa = {
  clienteId: string;
  valor: number;
  vencimento: string;
  categoriaId: string;
  competencia?: string;
};

// Competência da receita avulsa a partir do vencimento: mês do vencimento, dia 01. Usado como
// padrão apenas quando a competência não é informada (ex.: API v1). No SALDO a competência é o
// mês em que os serviços foram prestados — que pode diferir do mês do vencimento.
export function competenciaDoVencimento(vencimento: string): string {
  return `${vencimento.slice(0, 7)}-01`;
}

// Normaliza uma competência informada ("YYYY-MM" ou "YYYY-MM-DD") para "YYYY-MM-01".
// Retorna null quando ausente ou fora do formato — o chamador cai no padrão pelo vencimento.
export function normalizarCompetencia(competencia?: string | null): string | null {
  if (!competencia) return null;
  const m = /^(\d{4}-\d{2})(?:-\d{2})?$/.exec(competencia);
  return m ? `${m[1]}-01` : null;
}

export function validarCobrancaAvulsa(e: EntradaAvulsa): { ok: true } | { ok: false; erro: string } {
  if (!e.clienteId) return { ok: false, erro: "Selecione o cliente." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.vencimento)) return { ok: false, erro: "Vencimento inválido." };
  if (!(e.valor > 0)) return { ok: false, erro: "Informe um valor maior que zero." };
  if (!e.categoriaId) return { ok: false, erro: "Selecione a categoria." };
  if (e.competencia && !normalizarCompetencia(e.competencia)) return { ok: false, erro: "Competência inválida." };
  return { ok: true };
}
