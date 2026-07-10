import { describe, it, expect } from "vitest";
import { honorarioEm, type VigenciaValor } from "@/lib/financeiro/vigencia";

const v = (vigenteDe: string, valor: number, estimada = false): VigenciaValor => ({ vigenteDe, valor, estimada });

describe("honorarioEm — fronteiras", () => {
  const vigencias = [v("2025-10-01", 400, true), v("2026-01-01", 500), v("2026-03-01", 800)];

  it("mês exatamente igual ao vigente_de usa essa vigência", () => {
    expect(honorarioEm(vigencias, "2026-03")).toEqual({ valor: 800, estimado: false });
    expect(honorarioEm(vigencias, "2026-01")).toEqual({ valor: 500, estimado: false });
  });
  it("mês entre duas vigências usa a anterior", () => {
    expect(honorarioEm(vigencias, "2026-02")).toEqual({ valor: 500, estimado: false });
    expect(honorarioEm(vigencias, "2026-12")).toEqual({ valor: 800, estimado: false });
  });
  it("mês anterior à primeira vigência extrapola e marca como estimado", () => {
    expect(honorarioEm(vigencias, "2025-05")).toEqual({ valor: 400, estimado: true });
  });
  it("vigência marcada como estimada propaga o selo", () => {
    expect(honorarioEm(vigencias, "2025-11")).toEqual({ valor: 400, estimado: true });
  });
  it("lista vazia devolve zero estimado", () => {
    expect(honorarioEm([], "2026-03")).toEqual({ valor: 0, estimado: true });
  });
  it("não depende da ordem da lista", () => {
    const embaralhada = [vigencias[2]!, vigencias[0]!, vigencias[1]!];
    expect(honorarioEm(embaralhada, "2026-02")).toEqual({ valor: 500, estimado: false });
  });
});
