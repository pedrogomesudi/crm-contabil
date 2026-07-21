import { describe, it, expect } from "vitest";
import { agruparProdutividade, type ApontamentoBruto } from "@/lib/timesheet/produtividade";

const equipe = [
  { id: "u1", nome: "Ana" },
  { id: "u2", nome: "Bruno" },
  { id: "u3", nome: "Caio" }, // sem nenhuma atividade
];

describe("agruparProdutividade", () => {
  it("soma minutos por colaborador", () => {
    const apont: ApontamentoBruto[] = [
      { usuario_id: "u1", cliente_id: "c1", minutos: 60 },
      { usuario_id: "u1", cliente_id: "c1", minutos: 30 },
      { usuario_id: "u2", cliente_id: "c2", minutos: 120 },
    ];
    const r = agruparProdutividade({
      equipe,
      apontamentos: apont,
      tarefasPorResponsavel: {},
      obrigacoesPorEntregador: {},
    });
    expect(r.find((l) => l.usuarioId === "u1")!.minutos).toBe(90);
    expect(r.find((l) => l.usuarioId === "u2")!.minutos).toBe(120);
  });

  it("carteira = clientes distintos, ignora null e não conta duplicado", () => {
    const apont: ApontamentoBruto[] = [
      { usuario_id: "u1", cliente_id: "c1", minutos: 10 },
      { usuario_id: "u1", cliente_id: "c1", minutos: 10 }, // mesmo cliente
      { usuario_id: "u1", cliente_id: "c2", minutos: 10 },
      { usuario_id: "u1", cliente_id: null, minutos: 10 }, // sem cliente
    ];
    const r = agruparProdutividade({
      equipe,
      apontamentos: apont,
      tarefasPorResponsavel: {},
      obrigacoesPorEntregador: {},
    });
    expect(r.find((l) => l.usuarioId === "u1")!.carteira).toBe(2);
  });

  it("tarefas e obrigações vêm dos Records; ausente = 0", () => {
    const r = agruparProdutividade({
      equipe,
      apontamentos: [],
      tarefasPorResponsavel: { u1: 5 },
      obrigacoesPorEntregador: { u2: 3 },
    });
    expect(r.find((l) => l.usuarioId === "u1")!.tarefas).toBe(5);
    expect(r.find((l) => l.usuarioId === "u1")!.obrigacoes).toBe(0);
    expect(r.find((l) => l.usuarioId === "u2")!.obrigacoes).toBe(3);
  });

  it("membro sem nenhuma atividade aparece com tudo zero", () => {
    const r = agruparProdutividade({
      equipe,
      apontamentos: [],
      tarefasPorResponsavel: {},
      obrigacoesPorEntregador: {},
    });
    const caio = r.find((l) => l.usuarioId === "u3")!;
    expect(caio).toBeDefined();
    expect([caio.minutos, caio.tarefas, caio.obrigacoes, caio.carteira]).toEqual([0, 0, 0, 0]);
  });

  it("ordena por minutos desc, desempate por nome asc", () => {
    const apont: ApontamentoBruto[] = [
      { usuario_id: "u2", cliente_id: "c1", minutos: 100 },
      { usuario_id: "u1", cliente_id: "c1", minutos: 100 }, // empate com u2 → Ana antes de Bruno
    ];
    const r = agruparProdutividade({
      equipe,
      apontamentos: apont,
      tarefasPorResponsavel: {},
      obrigacoesPorEntregador: {},
    });
    expect(r.map((l) => l.usuarioId)).toEqual(["u1", "u2", "u3"]);
  });

  it("id fora da equipe (inativo que apontou no passado) não vira linha", () => {
    const apont: ApontamentoBruto[] = [{ usuario_id: "fantasma", cliente_id: "c1", minutos: 50 }];
    const r = agruparProdutividade({
      equipe: [{ id: "u1", nome: "Ana" }],
      apontamentos: apont,
      tarefasPorResponsavel: {},
      obrigacoesPorEntregador: {},
    });
    expect(r.map((l) => l.usuarioId)).toEqual(["u1"]);
  });
});
