import { describe, it, expect } from "vitest";
import { candidatosMovimento, autoCasar, type BaixaDisp, type TituloAberto } from "@/lib/conciliacao/casar";

const semBaixas: BaixaDisp[] = [];
const tit = (id: string, valor: number, baixado = 0): TituloAberto => ({
  tituloId: id,
  valor,
  baixado,
  tipo: "RECEBER",
  vencimento: "2026-07-10",
  descricao: id,
});

describe("candidatosMovimento (parcial)", () => {
  it("saldo igual ao movimento é candidato exato (parcial=false)", () => {
    const r = candidatosMovimento({ id: "m", valor: 100, data: "2026-07-10" }, semBaixas, [tit("t", 100)], 0.01);
    expect(r.titulos).toHaveLength(1);
    expect(r.titulos[0]!.parcial).toBe(false);
  });
  it("saldo maior que o movimento é candidato PARCIAL", () => {
    const r = candidatosMovimento({ id: "m", valor: 40, data: "2026-07-10" }, semBaixas, [tit("t", 100)], 0.01);
    expect(r.titulos[0]!.parcial).toBe(true);
  });
  it("saldo menor que o movimento (fora da tolerância) é excluído", () => {
    const r = candidatosMovimento({ id: "m", valor: 100, data: "2026-07-10" }, semBaixas, [tit("t", 40)], 0.01);
    expect(r.titulos).toHaveLength(0);
  });
  it("exatos vêm antes de parciais na ordem", () => {
    const r = candidatosMovimento(
      { id: "m", valor: 100, data: "2026-07-10" },
      semBaixas,
      [tit("maior", 500), tit("exato", 100)],
      0.01,
    );
    expect(r.titulos[0]!.tituloId).toBe("exato");
  });
});

describe("autoCasar não aplica parcial", () => {
  it("com só um candidato parcial, não propõe nada", () => {
    const r = autoCasar([{ id: "m", valor: 40, data: "2026-07-10" }], semBaixas, [tit("t", 100)], 0.01);
    expect(r).toHaveLength(0);
  });
});
