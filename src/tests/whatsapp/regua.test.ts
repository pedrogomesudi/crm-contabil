import { describe, it, expect } from "vitest";
import { diffDias, etapaDoDia, type EtapaAtiva } from "@/lib/whatsapp/regua";

const ETAPAS: EtapaAtiva[] = [
  { id: "a", dias_offset: -3, template: "d-3" },
  { id: "b", dias_offset: 1, template: "d+1" },
  { id: "c", dias_offset: 7, template: "d+7" },
];

describe("diffDias", () => {
  it("positivo = vencido, negativo = a vencer, 0 = no dia", () => {
    expect(diffDias("2026-07-10", "2026-07-10")).toBe(0);
    expect(diffDias("2026-07-13", "2026-07-10")).toBe(3);
    expect(diffDias("2026-07-07", "2026-07-10")).toBe(-3);
  });
});

describe("etapaDoDia", () => {
  it("casa o offset exato; senão null", () => {
    expect(etapaDoDia(ETAPAS, "2026-07-07", "2026-07-10")?.id).toBe("a"); // -3
    expect(etapaDoDia(ETAPAS, "2026-07-11", "2026-07-10")?.id).toBe("b"); // +1
    expect(etapaDoDia(ETAPAS, "2026-07-17", "2026-07-10")?.id).toBe("c"); // +7
    expect(etapaDoDia(ETAPAS, "2026-07-12", "2026-07-10")).toBeNull(); // +2 sem etapa
  });
});
