import { describe, it, expect } from "vitest";
import { npsDevido } from "@/lib/nps/devido";

const base = { ativo: true, periodicidadeDias: 90, hojeIso: "2026-07-21" };

describe("npsDevido", () => {
  it("nunca é devido quando inativo", () => {
    expect(npsDevido({ ...base, ativo: false, ultimaRespostaIso: null })).toBe(false);
  });
  it("é devido quando ativo e o cliente nunca respondeu", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: null })).toBe(true);
  });
  it("não é devido se a última resposta é mais recente que a periodicidade", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-06-21" })).toBe(false); // 30 dias < 90
  });
  it("é devido no limite exato da periodicidade", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-04-22" })).toBe(true); // 90 dias
  });
  it("não é devido um dia antes do limite", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-04-23" })).toBe(false); // 89 dias
  });
  it("respeita periodicidade customizada", () => {
    expect(npsDevido({ ...base, periodicidadeDias: 30, ultimaRespostaIso: "2026-06-21" })).toBe(true); // 30 >= 30
  });
  it("aceita timestamp completo na última resposta (usa só a data)", () => {
    expect(npsDevido({ ...base, ultimaRespostaIso: "2026-04-22T13:45:00Z" })).toBe(true);
  });
});
