import { describe, it, expect } from "vitest";
import { classificarRisco, montarPainel, type ItemRisco } from "@/lib/obrigacoes/risco";

const hoje = "2026-07-15";
const item = (over: Partial<ItemRisco>): ItemRisco => ({ id: "x", clienteNome: "C", obrigacaoNome: "O", competencia: "2026-06-01", periodicidade: "mensal", vencimentoInterno: hoje, vencimentoLegal: hoje, responsavelId: "u1", responsavelNome: "Ana", ...over });

describe("classificarRisco", () => {
  it("classifica nas fronteiras", () => {
    expect(classificarRisco("2026-07-14", hoje)).toBe("vencida");
    expect(classificarRisco("2026-07-15", hoje)).toBe("vencendo_hoje");
    expect(classificarRisco("2026-07-16", hoje)).toBe("no_prazo");
  });
});

describe("montarPainel", () => {
  const itens: ItemRisco[] = [
    item({ id: "a", vencimentoInterno: "2026-07-10", responsavelId: "u1", responsavelNome: "Ana" }), // vencida
    item({ id: "b", vencimentoInterno: "2026-07-15", responsavelId: "u1", responsavelNome: "Ana" }), // hoje
    item({ id: "c", vencimentoInterno: "2026-07-20", responsavelId: null, responsavelNome: null }), // sem resp
    item({ id: "d", vencimentoInterno: "2026-07-08", responsavelId: "u2", responsavelNome: "Bruno" }), // vencida
  ];
  it("resume as contagens", () => {
    const p = montarPainel(itens, hoje);
    expect(p.resumo).toEqual({ vencendoHoje: 1, vencidas: 2, semResponsavel: 1 });
  });
  it("põe 'sem responsável' no topo e agrupa o resto por nome", () => {
    const p = montarPainel(itens, hoje);
    expect(p.grupos[0]!.responsavelId).toBeNull();
    expect(p.grupos.map((g) => g.responsavelNome)).toEqual([null, "Ana", "Bruno"]);
  });
  it("ordena por atraso (interno asc) dentro do grupo", () => {
    const p = montarPainel(itens, hoje);
    const ana = p.grupos.find((g) => g.responsavelId === "u1")!;
    expect(ana.itens.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
