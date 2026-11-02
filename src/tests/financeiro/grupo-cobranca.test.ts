import { describe, it, expect } from "vitest";
import { somarHonorariosGrupo, type MembroGrupo } from "@/lib/financeiro/grupo-cobranca";

const m = (razao: string, cnpj: string, hon: number): MembroGrupo => ({
  clienteId: razao,
  razaoSocial: razao,
  cpfCnpj: cnpj,
  honorario: hon,
});

describe("somarHonorariosGrupo", () => {
  it("soma os honorários (2 casas)", () => {
    expect(somarHonorariosGrupo([m("A", "1", 200), m("B", "2", 300.15)])).toBe(500.15);
  });
  it("vazio = 0", () => {
    expect(somarHonorariosGrupo([])).toBe(0);
  });
});
