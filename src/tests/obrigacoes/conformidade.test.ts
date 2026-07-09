import { describe, it, expect } from "vitest";
import { classificarConformidade, resumirConformidade } from "@/lib/obrigacoes/conformidade";

const hoje = "2026-07-15";
describe("classificarConformidade", () => {
  it("entregue no dia = no prazo; depois = com atraso", () => {
    expect(classificarConformidade({ status: "pendente", entregueEm: "2026-07-10", vencimentoLegal: "2026-07-10" }, hoje)).toBe("no_prazo");
    expect(classificarConformidade({ status: "pendente", entregueEm: "2026-07-12", vencimentoLegal: "2026-07-10" }, hoje)).toBe("com_atraso");
  });
  it("pendente vencida vs no prazo", () => {
    expect(classificarConformidade({ status: "pendente", entregueEm: null, vencimentoLegal: "2026-07-14" }, hoje)).toBe("pendente_vencida");
    expect(classificarConformidade({ status: "pendente", entregueEm: null, vencimentoLegal: "2026-07-16" }, hoje)).toBe("pendente_no_prazo");
  });
  it("dispensada", () => {
    expect(classificarConformidade({ status: "dispensada", entregueEm: null, vencimentoLegal: "2026-07-01" }, hoje)).toBe("dispensada");
  });
});

describe("resumirConformidade", () => {
  it("conta e calcula % (dispensadas fora da base)", () => {
    const itens = [
      { status: "pendente", entregueEm: "2026-07-10", vencimentoLegal: "2026-07-10" },
      { status: "pendente", entregueEm: "2026-07-12", vencimentoLegal: "2026-07-10" },
      { status: "pendente", entregueEm: null, vencimentoLegal: "2026-07-14" },
      { status: "dispensada", entregueEm: null, vencimentoLegal: "2026-07-01" },
    ];
    const r = resumirConformidade(itens, hoje);
    expect(r.total).toBe(4);
    expect(r.noPrazo).toBe(1);
    expect(r.comAtraso).toBe(1);
    expect(r.pendenteVencida).toBe(1);
    expect(r.dispensada).toBe(1);
    expect(r.pctConformidade).toBe(33); // 1 / (4-1)
  });
  it("base zero → 100", () => {
    expect(resumirConformidade([{ status: "dispensada", entregueEm: null, vencimentoLegal: "2026-01-01" }], hoje).pctConformidade).toBe(100);
  });
});
