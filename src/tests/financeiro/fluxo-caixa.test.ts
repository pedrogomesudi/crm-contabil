import { describe, it, expect } from "vitest";
import { montarFluxoCaixa, type CategoriaFC, type ItemFluxo } from "@/lib/financeiro/fluxo-caixa";

const cats: CategoriaFC[] = [
  { id: "r1", nome: "Honorários", natureza: "RECEITA", ordem_dre: 1 },
  { id: "r2", nome: "Consultoria", natureza: "RECEITA", ordem_dre: 2 },
  { id: "d1", nome: "Aluguel", natureza: "DESPESA", ordem_dre: 3 },
  { id: "z9", nome: "Sem movimento", natureza: "DESPESA", ordem_dre: 4 },
];
const itens: ItemFluxo[] = [
  { categoriaId: "r1", mes: 1, tipo: "RECEBER", valor: 1000 },
  { categoriaId: "r1", mes: 2, tipo: "RECEBER", valor: 500 },
  { categoriaId: "r2", mes: 1, tipo: "RECEBER", valor: 300 },
  { categoriaId: "d1", mes: 1, tipo: "PAGAR", valor: 800 },
  { categoriaId: "d1", mes: 2, tipo: "PAGAR", valor: 2000 },
];

describe("montarFluxoCaixa", () => {
  it("separa Entradas/Saídas e agrupa por categoria/mês", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.entradas.linhas.map((l) => l.categoriaId)).toEqual(["r1", "r2"]);
    expect(f.entradas.linhas[0]!.valores[0]).toBe(1000);
    expect(f.entradas.linhas[0]!.valores[1]).toBe(500);
    expect(f.entradas.linhas[0]!.total).toBe(1500);
    expect(f.saidas.linhas.map((l) => l.categoriaId)).toEqual(["d1"]);
  });
  it("calcula totais do grupo por mês", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.entradas.totais[0]).toBe(1300); // 1000 + 300
    expect(f.entradas.total).toBe(1800);
    expect(f.saidas.totais[1]).toBe(2000);
  });
  it("resultado do mês = entradas − saídas", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.resultadoMes[0]).toBe(500); // 1300 − 800
    expect(f.resultadoMes[1]).toBe(-1500); // 500 − 2000
  });
  it("saldo acumulado corre a partir do saldo inicial (com mês negativo)", () => {
    const f = montarFluxoCaixa(cats, itens, 1000);
    expect(f.saldoAcumulado[0]).toBe(1500); // 1000 + 500
    expect(f.saldoAcumulado[1]).toBe(0); // 1500 − 1500
    expect(f.saldoAcumulado[11]).toBe(0); // sem mais movimento
    expect(f.saldoInicial).toBe(1000);
  });
  it("omite categorias sem movimento e ordena por ordem_dre", () => {
    const f = montarFluxoCaixa(cats, itens, 0);
    expect(f.saidas.linhas.find((l) => l.categoriaId === "z9")).toBeUndefined();
    expect(f.entradas.linhas[0]!.nome).toBe("Honorários");
  });
});
