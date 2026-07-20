export function valorAssinadoBaixa(b: { valorRecebido: number; tipoTitulo: "RECEBER" | "PAGAR" }): number {
  return b.tipoTitulo === "RECEBER" ? b.valorRecebido : -b.valorRecebido;
}
export function saldoTitulo(t: { valor: number; baixado: number }): number {
  return Math.round((t.valor - t.baixado) * 100) / 100;
}

export type MovPendente = { id: string; valor: number; data: string };
export type BaixaDisp = {
  baixaId: string;
  valorRecebido: number;
  tipoTitulo: "RECEBER" | "PAGAR";
  data: string;
  clienteNome: string;
};
export type TituloAberto = {
  tituloId: string;
  valor: number;
  baixado: number;
  tipo: "RECEBER" | "PAGAR";
  vencimento: string;
  descricao: string;
};
export type CandBaixa = { baixaId: string; data: string; clienteNome: string };
export type CandTitulo = {
  tituloId: string;
  vencimento: string;
  descricao: string;
  tipo: "RECEBER" | "PAGAR";
  saldo: number;
  parcial: boolean;
};

export const casaValor = (x: number, y: number, tol: number) => Math.abs(x - y) <= tol;
const dist = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));

export function candidatosMovimento(
  mov: MovPendente,
  baixas: BaixaDisp[],
  titulos: TituloAberto[],
  tol = 0,
): { baixas: CandBaixa[]; titulos: CandTitulo[] } {
  const cb = baixas
    .filter((b) => casaValor(valorAssinadoBaixa(b), mov.valor, tol))
    .sort((a, b) => dist(a.data, mov.data) - dist(b.data, mov.data))
    .map((b) => ({ baixaId: b.baixaId, data: b.data, clienteNome: b.clienteNome }));
  const tipoAlvo = mov.valor > 0 ? "RECEBER" : "PAGAR";
  const abs = Math.abs(mov.valor);
  // Cabe exato OU parcial: o saldo do título cobre o movimento (dentro da tolerância).
  const ct = titulos
    .filter((t) => t.tipo === tipoAlvo && saldoTitulo(t) >= abs - tol)
    .sort((a, b) => {
      const pa = saldoTitulo(a) > abs + tol ? 1 : 0;
      const pb = saldoTitulo(b) > abs + tol ? 1 : 0;
      return pa - pb || dist(a.vencimento, mov.data) - dist(b.vencimento, mov.data);
    })
    .slice(0, 20)
    .map((t) => ({
      tituloId: t.tituloId,
      vencimento: t.vencimento,
      descricao: t.descricao,
      tipo: t.tipo,
      saldo: saldoTitulo(t),
      parcial: saldoTitulo(t) > abs + tol,
    }));
  return { baixas: cb, titulos: ct };
}

export type Casamento = { movimentoId: string; alvo: "baixa" | "titulo"; alvoId: string };
export function autoCasar(
  movimentos: MovPendente[],
  baixas: BaixaDisp[],
  titulos: TituloAberto[],
  tol = 0,
): Casamento[] {
  const prop: Casamento[] = [];
  for (const mov of movimentos) {
    const c = candidatosMovimento(mov, baixas, titulos, tol);
    const titExatos = c.titulos.filter((t) => !t.parcial); // o automático nunca aplica parcial
    if (c.baixas.length + titExatos.length !== 1) continue;
    if (c.baixas.length === 1) prop.push({ movimentoId: mov.id, alvo: "baixa", alvoId: c.baixas[0]!.baixaId });
    else prop.push({ movimentoId: mov.id, alvo: "titulo", alvoId: titExatos[0]!.tituloId });
  }
  const contagem = new Map<string, number>();
  for (const p of prop) contagem.set(p.alvoId, (contagem.get(p.alvoId) ?? 0) + 1);
  return prop.filter((p) => contagem.get(p.alvoId) === 1);
}
