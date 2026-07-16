import { describe, it, expect } from "vitest";
import {
  valorAssinadoBaixa,
  saldoTitulo,
  candidatosMovimento,
  autoCasar,
  type BaixaDisp,
  type TituloAberto,
  type MovPendente,
} from "@/lib/conciliacao/casar";

describe("valorAssinadoBaixa / saldoTitulo", () => {
  it("assina pela natureza do título", () => {
    expect(valorAssinadoBaixa({ valorRecebido: 300, tipoTitulo: "RECEBER" })).toBe(300);
    expect(valorAssinadoBaixa({ valorRecebido: 89.9, tipoTitulo: "PAGAR" })).toBe(-89.9);
  });
  it("saldo = valor − baixado", () => {
    expect(saldoTitulo({ valor: 300, baixado: 0 })).toBe(300);
    expect(saldoTitulo({ valor: 300, baixado: 100 })).toBe(200);
  });
});

const baixas: BaixaDisp[] = [
  { baixaId: "b1", valorRecebido: 300, tipoTitulo: "RECEBER", data: "2026-08-20", clienteNome: "ACME" },
  { baixaId: "b2", valorRecebido: 89.9, tipoTitulo: "PAGAR", data: "2026-08-05", clienteNome: "" },
];
const titulos: TituloAberto[] = [
  { tituloId: "t1", valor: 500, baixado: 0, tipo: "RECEBER", vencimento: "2026-08-10", descricao: "Consultoria" },
];

describe("candidatosMovimento", () => {
  it("casa baixa por valor assinado (crédito)", () => {
    const r = candidatosMovimento({ id: "m1", valor: 300, data: "2026-08-21" }, baixas, titulos);
    expect(r.baixas.map((b) => b.baixaId)).toEqual(["b1"]);
    expect(r.titulos).toEqual([]);
  });
  it("casa título por saldo e tipo pelo sinal (crédito → RECEBER)", () => {
    const r = candidatosMovimento({ id: "m2", valor: 500, data: "2026-08-11" }, baixas, titulos);
    expect(r.titulos.map((t) => t.tituloId)).toEqual(["t1"]);
  });
  it("débito casa baixa PAGAR", () => {
    const r = candidatosMovimento({ id: "m3", valor: -89.9, data: "2026-08-06" }, baixas, titulos);
    expect(r.baixas.map((b) => b.baixaId)).toEqual(["b2"]);
  });
});

describe("autoCasar", () => {
  it("casa o 1:1 inequívoco", () => {
    const movs: MovPendente[] = [
      { id: "m1", valor: 300, data: "2026-08-21" },
      { id: "m2", valor: 500, data: "2026-08-11" },
    ];
    const r = autoCasar(movs, baixas, titulos);
    expect(r).toEqual([
      { movimentoId: "m1", alvo: "baixa", alvoId: "b1" },
      { movimentoId: "m2", alvo: "titulo", alvoId: "t1" },
    ]);
  });
  it("não casa quando dois movimentos disputam o mesmo alvo", () => {
    const movs: MovPendente[] = [
      { id: "m1", valor: 300, data: "2026-08-21" },
      { id: "m1b", valor: 300, data: "2026-08-22" },
    ];
    expect(autoCasar(movs, baixas, titulos)).toEqual([]);
  });
});
