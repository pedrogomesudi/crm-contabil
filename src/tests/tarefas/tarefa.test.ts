import { describe, it, expect } from "vitest";
import { TAREFA_STATUS, TAREFA_PRIORIDADE, progressoChecklist, ordemPrioridade } from "@/lib/tarefas/tarefa";
import { podeGerenciarTarefas } from "@/lib/clientes/permissoes";

describe("tarefa", () => {
  it("status e prioridade rotulados", () => {
    expect(TAREFA_STATUS.length).toBe(4);
    expect(TAREFA_PRIORIDADE.length).toBe(4);
  });
  it("progressoChecklist", () => {
    expect(progressoChecklist([{ feito: true }, { feito: false }, { feito: true }])).toEqual({
      total: 3,
      feitos: 2,
      pct: 67,
    });
    expect(progressoChecklist([])).toEqual({ total: 0, feitos: 0, pct: 0 });
  });
  it("ordemPrioridade urgente primeiro", () => {
    expect(ordemPrioridade("urgente")).toBeLessThan(ordemPrioridade("baixa"));
  });
  it("podeGerenciarTarefas: equipe sim, undefined não", () => {
    expect(podeGerenciarTarefas("financeiro")).toBe(true);
    expect(podeGerenciarTarefas(undefined)).toBe(false);
  });
});
