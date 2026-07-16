import { describe, it, expect } from "vitest";
import { classificarVencimento, ordemSeveridade, montarPainel, type ItemVencimento } from "@/lib/vencimentos/alerta";

const HOJE = "2026-07-09";

// Fronteiras: é exatamente aqui que este tipo de classificador erra.
describe("classificarVencimento — fronteiras", () => {
  const casos: [string, number, string][] = [
    ["2026-09-08", 61, "ok"],
    ["2026-09-07", 60, "aviso"],
    ["2026-08-09", 31, "aviso"],
    ["2026-08-08", 30, "alerta"],
    ["2026-07-25", 16, "alerta"],
    ["2026-07-24", 15, "critico"],
    ["2026-07-09", 0, "critico"],
    ["2026-07-08", -1, "vencido"],
  ];
  for (const [validade, dias, severidade] of casos) {
    it(`${validade} (${dias} dias) => ${severidade}`, () => {
      const r = classificarVencimento(validade, HOJE);
      expect(r.diasRestantes).toBe(dias);
      expect(r.severidade).toBe(severidade);
    });
  }
  it("data inválida não quebra: cai em ok", () => {
    expect(classificarVencimento("nao-e-data", HOJE).severidade).toBe("ok");
  });
});

describe("ordemSeveridade", () => {
  it("ordena do mais grave ao menos grave", () => {
    const ordenado = (["aviso", "vencido", "ok", "critico", "alerta"] as const)
      .slice()
      .sort((a, b) => ordemSeveridade(a) - ordemSeveridade(b));
    expect(ordenado).toEqual(["vencido", "critico", "alerta", "aviso", "ok"]);
  });
});

function item(p: Partial<ItemVencimento>): ItemVencimento {
  return {
    id: "1",
    origem: "certificado",
    clienteId: "c1",
    clienteNome: "Cliente",
    titulo: "A1",
    detalhe: "",
    validade: "2026-07-20",
    severidade: "critico",
    diasRestantes: 11,
    editavel: true,
    ...p,
  };
}

describe("montarPainel", () => {
  it("descarta os ok, conta os quatro cartões e ordena por severidade", () => {
    const itens = [
      item({ id: "a", severidade: "aviso", validade: "2026-09-01" }),
      item({ id: "b", severidade: "ok", validade: "2026-12-01" }),
      item({ id: "c", severidade: "vencido", validade: "2026-07-01" }),
      item({ id: "d", severidade: "alerta", validade: "2026-08-01" }),
      item({ id: "e", severidade: "critico", validade: "2026-07-15" }),
    ];
    const { resumo, itens: saida } = montarPainel(itens);
    expect(resumo).toEqual({ vencidos: 1, criticos: 1, alertas: 1, avisos: 1 });
    expect(saida.map((i) => i.id)).toEqual(["c", "e", "d", "a"]);
  });
  it("empate de severidade desempata pela validade mais próxima", () => {
    const itens = [
      item({ id: "tarde", severidade: "critico", validade: "2026-07-20" }),
      item({ id: "cedo", severidade: "critico", validade: "2026-07-11" }),
    ];
    expect(montarPainel(itens).itens.map((i) => i.id)).toEqual(["cedo", "tarde"]);
  });
});
