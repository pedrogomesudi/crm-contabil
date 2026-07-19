import { describe, it, expect } from "vitest";
import { lerFiltroBusca } from "@/lib/documentos/busca-metadados";

describe("lerFiltroBusca", () => {
  it("competência vira o intervalo do mês", () => {
    const f = lerFiltroBusca({ competencia: "2026-07" });
    expect(f.compInicio).toBe("2026-07-01");
    expect(f.compFim).toBe("2026-08-01");
  });
  it("dezembro vira janeiro do ano seguinte", () => {
    const f = lerFiltroBusca({ competencia: "2026-12" });
    expect(f.compInicio).toBe("2026-12-01");
    expect(f.compFim).toBe("2027-01-01");
  });
  it("competência inválida é omitida", () => {
    expect(lerFiltroBusca({ competencia: "2026-13" }).compInicio).toBeUndefined();
    expect(lerFiltroBusca({ competencia: "xx" }).competencia).toBeUndefined();
  });
  it("nome é preservado (trim) e vazios são omitidos", () => {
    const f = lerFiltroBusca({ nome: "  guia ", tipo: "", departamento: "fiscal" });
    expect(f.nome).toBe("guia");
    expect(f.tipoId).toBeUndefined();
    expect(f.departamento).toBe("fiscal");
  });
});
