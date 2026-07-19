import { describe, it, expect } from "vitest";
import { etapasDevidas, aplicarVariaveis, agendaFollowup } from "@/lib/comercial/followup";

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

describe("agendaFollowup", () => {
  const etapas = [
    { id: "e1", diasOffset: 0 },
    { id: "e2", diasOffset: 3 },
    { id: "e3", diasOffset: 7 },
  ];
  it("mapeia enviado (com data), pendente (venceu, sem envio) e agendado (futuro)", () => {
    const envios = [{ etapaId: "e1", enviadoEm: "2026-07-01T12:00:00Z", status: "enviado" }];
    const r = agendaFollowup("2026-07-01T00:00:00Z", etapas, envios, "2026-07-04");
    expect(r[0]).toEqual({ dias: 0, dataPrevista: "2026-07-01", situacao: "enviado", quando: "2026-07-01" });
    expect(r[1]).toEqual({ dias: 3, dataPrevista: "2026-07-04", situacao: "pendente", quando: null });
    expect(r[2]).toEqual({ dias: 7, dataPrevista: "2026-07-08", situacao: "agendado", quando: null });
  });
  it("reflete sem_destino e falhou do registro", () => {
    const envios = [
      { etapaId: "e1", enviadoEm: "2026-07-01T12:00:00Z", status: "sem_destino" },
      { etapaId: "e2", enviadoEm: "2026-07-04T12:00:00Z", status: "falhou" },
    ];
    const r = agendaFollowup("2026-07-01T00:00:00Z", etapas, envios, "2026-07-10");
    expect(r[0]!.situacao).toBe("sem_destino");
    expect(r[1]!.situacao).toBe("falhou");
  });
});
