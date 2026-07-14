import { describe, it, expect } from "vitest";
import { ondasDoTemplate, resumoFluxo, progressoProcesso, type SopEtapa } from "@/lib/tarefas/sop";

const etapa = (id: string, onda: number, ordem: number): SopEtapa => ({
  id,
  onda,
  ordem,
  titulo: `Etapa ${id}`,
  descricao: null,
  responsavelPapel: null,
  prazoDias: 0,
  prioridade: "media",
  itens: [],
});

describe("ondasDoTemplate", () => {
  it("agrupa por onda e ordena, mesmo com as etapas fora de ordem", () => {
    const ondas = ondasDoTemplate([etapa("c", 2, 1), etapa("b", 1, 2), etapa("a", 1, 1)]);
    expect(ondas.map((o) => o.onda)).toEqual([1, 2]);
    expect(ondas[0]?.etapas.map((e) => e.id)).toEqual(["a", "b"]);
    expect(ondas[1]?.etapas.map((e) => e.id)).toEqual(["c"]);
  });
});

describe("resumoFluxo", () => {
  it("descreve o fluxo, marcando o paralelismo", () => {
    expect(resumoFluxo([etapa("a", 1, 1), etapa("b", 1, 2), etapa("c", 2, 1)])).toBe(
      "Onda 1 (2 em paralelo) → Onda 2 (1)",
    );
  });

  it("sem etapas, não quebra", () => {
    expect(resumoFluxo([])).toBe("Sem etapas.");
  });
});

describe("progressoProcesso", () => {
  it("conta concluídas e canceladas como fechadas", () => {
    expect(progressoProcesso([{ status: "concluida" }, { status: "cancelada" }, { status: "aberta" }])).toEqual({
      feitas: 2,
      total: 3,
      pct: 67,
    });
  });

  it("processo vazio não divide por zero", () => {
    expect(progressoProcesso([])).toEqual({ feitas: 0, total: 0, pct: 0 });
  });
});
