import { describe, it, expect } from "vitest";
import { etapasDevidas, aplicarVariaveis } from "@/lib/comercial/followup";

const etapas = [
  { id: "e1", diasOffset: 0, ativa: true },
  { id: "e2", diasOffset: 3, ativa: true },
  { id: "e3", diasOffset: 7, ativa: true },
  { id: "e4", diasOffset: 3, ativa: false },
];

describe("etapasDevidas", () => {
  it("inclui as etapas ativas vencidas (enviada + offset ≤ hoje) e não enviadas", () => {
    const r = etapasDevidas("2026-07-01T12:00:00Z", etapas, [], "2026-07-04");
    expect(r.map((e) => e.id)).toEqual(["e1", "e2"]); // e1 (07-01), e2 (07-04); e3 (07-08) não; e4 inativa
  });
  it("pula as já enviadas", () => {
    const r = etapasDevidas("2026-07-01T12:00:00Z", etapas, ["e1"], "2026-07-04");
    expect(r.map((e) => e.id)).toEqual(["e2"]);
  });
  it("nada vencido ainda", () => {
    const r = etapasDevidas("2026-07-01T12:00:00Z", etapas, [], "2026-07-01");
    expect(r.map((e) => e.id)).toEqual(["e1"]); // só o D+0
  });
});

describe("aplicarVariaveis", () => {
  it("substitui {chave} pelos valores; deixa desconhecidas como estão", () => {
    expect(aplicarVariaveis("Olá {prospect}, proposta {numero} — {x}", { prospect: "ACME", numero: "7" })).toBe(
      "Olá ACME, proposta 7 — {x}",
    );
  });
});
