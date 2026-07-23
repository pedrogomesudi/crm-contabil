import { describe, it, expect } from "vitest";
import { decidirEnvio, dentroDaJanela, POLITICA, PARAMS_FLUXO } from "@/lib/whatsapp/politica-proativo";

describe("dentroDaJanela", () => {
  const agora = "2026-07-23T12:00:00.000Z";
  it("sem entrada nenhuma → fora", () => {
    expect(dentroDaJanela(null, agora)).toBe(false);
  });
  it("23h atrás → dentro; 25h atrás → fora", () => {
    expect(dentroDaJanela("2026-07-23T13:00:00.000Z", "2026-07-24T12:00:00.000Z")).toBe(true);
    expect(dentroDaJanela("2026-07-22T11:00:00.000Z", agora)).toBe(false);
  });
  it("exatamente 24h → fora (o limite não é inclusivo)", () => {
    expect(dentroDaJanela("2026-07-22T12:00:00.000Z", agora)).toBe(false);
  });
  it("data inválida → fora (não arrisca enviar texto livre por engano)", () => {
    expect(dentroDaJanela("não é data", agora)).toBe(false);
  });
});

describe("decidirEnvio", () => {
  it("provedor sem exigência (Z-API) sempre manda texto", () => {
    expect(
      decidirEnvio({ politica: "sempre_template", exigeTemplate: false, dentroDaJanela: false, temTemplate: false }),
    ).toEqual({ modo: "texto" });
  });
  it("oficial + política janela + dentro da janela → texto", () => {
    expect(
      decidirEnvio({ politica: "janela", exigeTemplate: true, dentroDaJanela: true, temTemplate: false }),
    ).toEqual({ modo: "texto" });
  });
  it("oficial + política janela + fora da janela + template → template", () => {
    expect(
      decidirEnvio({ politica: "janela", exigeTemplate: true, dentroDaJanela: false, temTemplate: true }),
    ).toEqual({ modo: "template" });
  });
  it("oficial + sempre_template ignora a janela", () => {
    expect(
      decidirEnvio({ politica: "sempre_template", exigeTemplate: true, dentroDaJanela: true, temTemplate: true }),
    ).toEqual({ modo: "template" });
  });
  it("oficial sem template configurado → falha com motivo", () => {
    const r = decidirEnvio({
      politica: "sempre_template",
      exigeTemplate: true,
      dentroDaJanela: true,
      temTemplate: false,
    });
    expect(r.modo).toBe("falha");
    if (r.modo === "falha") expect(r.motivo).toMatch(/template/i);
  });
});

describe("contratos por fluxo", () => {
  it("todo fluxo tem política e lista de parâmetros", () => {
    for (const f of Object.keys(POLITICA) as (keyof typeof POLITICA)[]) {
      expect(PARAMS_FLUXO[f]?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PARAMS_FLUXO).sort()).toEqual(Object.keys(POLITICA).sort());
  });
});
