import { describe, it, expect } from "vitest";
import {
  conferirHonorarios,
  SITUACOES,
  type EntradaConferencia,
  type ClienteConferencia,
} from "@/lib/nfse/conferencia";

const cliente = (over: Partial<ClienteConferencia> = {}): ClienteConferencia => ({
  clienteId: "c1",
  razaoSocial: "ACME LTDA",
  grupoNome: null,
  titulo: { valor: 300, status: "ABERTO" },
  notas: [{ numero: 10, valor: 300, cancelada: false }],
  boleto: { numero: 55, temLinhaDigitavel: true },
  temContato: true,
  ...over,
});
const conferir = (c: ClienteConferencia[]): EntradaConferencia => conferirHonorarios(c);

describe("conferirHonorarios — caso são", () => {
  it("tudo casando não gera divergência", () => {
    const r = conferir([cliente()]);
    expect(r.linhas[0]!.situacoes).toEqual([]);
    expect(r.linhas[0]!.impede).toBe(false);
  });

  it("totais: financeiro, fiscal e diferença", () => {
    const r = conferir([
      cliente(),
      cliente({
        clienteId: "c2",
        titulo: { valor: 200, status: "ABERTO" },
        notas: [{ numero: 11, valor: 200, cancelada: false }],
      }),
    ]);
    expect(r.totais).toEqual({ financeiro: 500, fiscal: 500, diferenca: 0, clientes: 2, comDivergencia: 0 });
  });
});

describe("conferirHonorarios — divergências que impedem", () => {
  it("valor da nota diferente do título (o caso Porfirio: nota 250, boleto 287)", () => {
    const r = conferir([
      cliente({ titulo: { valor: 287, status: "ABERTO" }, notas: [{ numero: 10, valor: 250, cancelada: false }] }),
    ]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.VALOR_DIVERGE);
    expect(r.linhas[0]!.impede).toBe(true);
    expect(r.totais.diferenca).toBe(-37);
  });

  it("honorário sem nota autorizada", () => {
    const r = conferir([cliente({ notas: [] })]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.SEM_NOTA);
    expect(r.linhas[0]!.impede).toBe(true);
  });

  it("título sem boleto", () => {
    const r = conferir([cliente({ boleto: null })]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.SEM_BOLETO);
  });

  it("boleto sem linha digitável", () => {
    const r = conferir([cliente({ boleto: { numero: 55, temLinhaDigitavel: false } })]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.BOLETO_INCOMPLETO);
  });

  it("cliente sem canal de contato", () => {
    const r = conferir([cliente({ temContato: false })]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.SEM_CONTATO);
  });

  it("duas notas casando em valor — risco de envio duplicado", () => {
    const r = conferir([
      cliente({
        notas: [
          { numero: 10, valor: 300, cancelada: false },
          { numero: 12, valor: 300, cancelada: false },
        ],
      }),
    ]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.NOTA_DUPLICADA);
    expect(r.linhas[0]!.impede).toBe(true);
  });
});

describe("conferirHonorarios — informativos", () => {
  it("nota de outro serviço não é divergência, mas aparece", () => {
    const r = conferir([
      cliente({
        notas: [
          { numero: 10, valor: 300, cancelada: false },
          { numero: 11, valor: 9300, cancelada: false },
        ],
      }),
    ]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.NOTA_OUTRO_SERVICO);
    expect(r.linhas[0]!.impede).toBe(false);
  });

  it("nota cancelada é informativa e não conta no fiscal", () => {
    const r = conferir([
      cliente({
        notas: [
          { numero: 10, valor: 300, cancelada: false },
          { numero: 9, valor: 300, cancelada: true },
        ],
      }),
    ]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.NOTA_CANCELADA);
    expect(r.linhas[0]!.impede).toBe(false);
    expect(r.totais.fiscal).toBe(300);
  });

  it("fatura já baixada é informativa — não deve ser reenviada", () => {
    const r = conferir([cliente({ titulo: { valor: 300, status: "BAIXADO" } })]);
    expect(r.linhas[0]!.situacoes).toContain(SITUACOES.FATURA_ENCERRADA);
    expect(r.linhas[0]!.impede).toBe(false);
  });
});

describe("conferirHonorarios — ordenação e contagem", () => {
  it("quem impede vem primeiro; o resto por razão social", () => {
    const r = conferir([
      cliente({ clienteId: "a", razaoSocial: "AAA LTDA" }),
      cliente({ clienteId: "z", razaoSocial: "ZZZ LTDA", notas: [] }),
      cliente({ clienteId: "b", razaoSocial: "BBB LTDA" }),
    ]);
    expect(r.linhas.map((l) => l.razaoSocial)).toEqual(["ZZZ LTDA", "AAA LTDA", "BBB LTDA"]);
    expect(r.totais.comDivergencia).toBe(1);
  });
});

// Regressão com o cenário real de 10/2026, conferido contra produção em 02/11/2026:
// 164 honorários, todos com nota, boleto e contato, somando R$ 81.745,10 dos dois lados.
// Se alguma regra passar a acusar divergência num cenário são, este teste cai.
describe("cenário real — competência 10/2026", () => {
  it("164 honorários casando não produzem divergência alguma", () => {
    const clientes: ClienteConferencia[] = Array.from({ length: 164 }, (_, i) => ({
      clienteId: `c${i}`,
      razaoSocial: `EMPRESA ${String(i).padStart(3, "0")} LTDA`,
      grupoNome: i < 27 ? "CONSTROI" : null,
      titulo: { valor: 498.45, status: "ABERTO" },
      notas: [{ numero: 1000 + i, valor: 498.45, cancelada: false }],
      boleto: { numero: 500 + i, temLinhaDigitavel: true },
      temContato: true,
    }));
    const r = conferirHonorarios(clientes);
    expect(r.totais.comDivergencia).toBe(0);
    expect(r.totais.clientes).toBe(164);
    expect(r.totais.diferenca).toBe(0);
    expect(r.totais.financeiro).toBe(r.totais.fiscal);
  });

  it("uma nota de outro serviço no meio não vira divergência nem soma no fiscal", () => {
    const clientes: ClienteConferencia[] = [
      {
        clienteId: "dgx",
        razaoSocial: "DGX GESTAO E NEGOCIOS LTDA",
        grupoNome: null,
        titulo: { valor: 1200, status: "ABERTO" },
        notas: [
          { numero: 1, valor: 1200, cancelada: false },
          { numero: 2, valor: 32000, cancelada: false },
          { numero: 3, valor: 9300, cancelada: false },
        ],
        boleto: { numero: 9, temLinhaDigitavel: true },
        temContato: true,
      },
    ];
    const r = conferirHonorarios(clientes);
    expect(r.linhas[0]!.impede).toBe(false);
    expect(r.linhas[0]!.situacoes).toEqual([SITUACOES.NOTA_OUTRO_SERVICO]);
    expect(r.totais.fiscal).toBe(1200);
    expect(r.totais.diferenca).toBe(0);
  });
});
