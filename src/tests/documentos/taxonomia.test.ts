import { describe, it, expect } from "vitest";
import { competenciaParaData, competenciaRotulo, departamentoDoTipo } from "@/lib/documentos/taxonomia";

describe("competenciaParaData", () => {
  it("mês válido vira o dia 1", () => expect(competenciaParaData("2026-07")).toBe("2026-07-01"));
  it("vazio é null", () => expect(competenciaParaData("")).toBeNull());
  it("formato inválido é null", () => {
    expect(competenciaParaData("2026-13")).toBeNull();
    expect(competenciaParaData("julho")).toBeNull();
  });
});

describe("competenciaRotulo", () => {
  it("data vira MM/AAAA", () => expect(competenciaRotulo("2026-07-01")).toBe("07/2026"));
  it("null vira travessão", () => expect(competenciaRotulo(null)).toBe("—"));
});

describe("departamentoDoTipo", () => {
  const tipos = [
    { id: "a", departamento: "fiscal" },
    { id: "b", departamento: null },
  ];
  it("acha o departamento do tipo", () => expect(departamentoDoTipo(tipos, "a")).toBe("fiscal"));
  it("tipo sem departamento é null", () => expect(departamentoDoTipo(tipos, "b")).toBeNull());
  it("tipo inexistente é null", () => expect(departamentoDoTipo(tipos, "z")).toBeNull());
});
