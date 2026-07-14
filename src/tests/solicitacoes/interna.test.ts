import { describe, it, expect } from "vitest";
import { estaVencida, ordenarFila, slaDoDepartamento } from "@/lib/solicitacoes/interna";

describe("estaVencida", () => {
  it("vencida quando o prazo passou e não está resolvida", () => {
    expect(estaVencida("aberta", "2026-07-10", "2026-07-14")).toBe(true);
  });

  it("resolvida NUNCA conta como vencida (o trabalho acabou)", () => {
    expect(estaVencida("resolvida", "2026-07-10", "2026-07-14")).toBe(false);
  });

  it("sem prazo, não vence", () => {
    expect(estaVencida("aberta", null, "2026-07-14")).toBe(false);
  });

  it("no dia do prazo ainda não venceu", () => {
    expect(estaVencida("aberta", "2026-07-14", "2026-07-14")).toBe(false);
  });
});

describe("ordenarFila", () => {
  it("vencidas primeiro; depois por prazo; sem prazo por último", () => {
    const itens = [
      { id: "futura", prazo: "2026-07-20", status: "aberta" as const, responsavelId: null },
      { id: "vencida", prazo: "2026-07-01", status: "aberta" as const, responsavelId: null },
      { id: "sem-prazo", prazo: null, status: "aberta" as const, responsavelId: null },
      { id: "hoje", prazo: "2026-07-14", status: "aberta" as const, responsavelId: null },
    ];
    expect(ordenarFila(itens, "2026-07-14").map((i) => i.id)).toEqual(["vencida", "hoje", "futura", "sem-prazo"]);
  });
});

describe("slaDoDepartamento", () => {
  const slas = [{ departamento: "fiscal", dias: 2 }];

  it("usa o SLA cadastrado", () => {
    expect(slaDoDepartamento(slas, "fiscal")).toEqual({ dias: 2, padrao: false });
  });

  it("sem SLA cadastrado, cai no padrão E SINALIZA (a tela avisa)", () => {
    expect(slaDoDepartamento(slas, "contabil")).toEqual({ dias: 3, padrao: true });
  });
});
