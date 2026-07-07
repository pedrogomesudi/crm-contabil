export type DadosPagamento = {
  pixChave?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  titular?: string | null;
  documento?: string | null;
};

// Monta as linhas de pagamento a partir dos dados preenchidos (omite as vazias).
export function linhasPagamento(d: DadosPagamento): string {
  const linhas: string[] = [];
  if (d.pixChave) linhas.push(`PIX: ${d.pixChave}`);
  const partes = [d.banco && `Banco ${d.banco}`, d.agencia && `Ag. ${d.agencia}`, d.conta && `Conta ${d.conta}`].filter(Boolean);
  if (partes.length) {
    let ted = `TED: ${partes.join(", ")}`;
    if (d.titular) ted += ` — ${d.titular}`;
    if (d.documento) ted += ` (${d.documento})`;
    linhas.push(ted);
  }
  return linhas.join("\n");
}

// "2026-07-01" → "07/2026".
export function competenciaBR(dataIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dataIso);
  return m ? `${m[2]}/${m[1]}` : dataIso;
}
