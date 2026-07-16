import { describe, it, expect } from "vitest";
import {
  feriadosNacionais,
  ehDiaUtil,
  diaUtilAnterior,
  subtraiDiasUteis,
  calcularVencimento,
  type RegraPrazo,
} from "@/lib/obrigacoes/prazo";

describe("feriadosNacionais", () => {
  it("inclui fixos e móveis (2026: Páscoa 05/04)", () => {
    const f = feriadosNacionais(2026);
    expect(f.has("2026-01-01")).toBe(true);
    expect(f.has("2026-12-25")).toBe(true);
    expect(f.has("2026-04-03")).toBe(true); // Sexta-feira Santa
    expect(f.has("2026-02-17")).toBe(true); // Carnaval (terça)
    expect(f.has("2026-06-04")).toBe(true); // Corpus Christi
  });
});

describe("dias úteis", () => {
  const f = feriadosNacionais(2026);
  it("ehDiaUtil ignora fds e feriado", () => {
    expect(ehDiaUtil("2026-07-04", f)).toBe(false); // sábado
    expect(ehDiaUtil("2026-07-06", f)).toBe(true); // segunda
    expect(ehDiaUtil("2026-12-25", f)).toBe(false); // feriado
  });
  it("diaUtilAnterior recua fds/feriado", () => {
    expect(diaUtilAnterior("2026-07-05", f)).toBe("2026-07-03"); // domingo → sexta
    expect(diaUtilAnterior("2026-07-06", f)).toBe("2026-07-06"); // já útil
  });
  it("subtraiDiasUteis conta só dias úteis", () => {
    expect(subtraiDiasUteis("2026-07-06", 1, f)).toBe("2026-07-03"); // segunda −1 útil = sexta
    expect(subtraiDiasUteis("2026-07-06", 2, f)).toBe("2026-07-02");
  });
});

describe("calcularVencimento", () => {
  const base: RegraPrazo = {
    periodicidade: "mensal",
    vencDia: 20,
    vencMesOffset: 1,
    vencMes: null,
    vencAnoOffset: 1,
    prazoInternoDiasUteis: 0,
    antecipa: true,
  };
  it("mensal: dia 20 do mês seguinte à competência", () => {
    expect(calcularVencimento(base, "2026-07-01").legal).toBe("2026-08-20");
  });
  it("mensal em outras competências", () => {
    expect(calcularVencimento(base, "2026-09-01").legal).toBe("2026-10-20"); // 20/10 é terça
    expect(calcularVencimento(base, "2026-12-01").legal).toBe("2027-01-20"); // vira o ano
  });
  it("clampa o dia ao fim do mês", () => {
    const r: RegraPrazo = { ...base, vencDia: 31, vencMesOffset: 0 };
    // competência 02/2026 (fev tem 28) → 28/02/2026 é sábado → antecipa p/ 27 (sexta)
    expect(calcularVencimento(r, "2026-02-01").legal).toBe("2026-02-27");
  });
  it("anual: 31/05 do ano seguinte", () => {
    const r: RegraPrazo = {
      periodicidade: "anual",
      vencDia: 31,
      vencMesOffset: 1,
      vencMes: 5,
      vencAnoOffset: 1,
      prazoInternoDiasUteis: 0,
      antecipa: true,
    };
    expect(calcularVencimento(r, "2026-01-01").legal).toBe("2027-05-31"); // segunda, útil
  });
  it("prazo interno = N dias úteis antes do legal", () => {
    const r: RegraPrazo = { ...base, prazoInternoDiasUteis: 2 };
    const v = calcularVencimento(r, "2026-07-01"); // legal 20/08/2026 (quinta)
    expect(v.legal).toBe("2026-08-20");
    expect(v.interno).toBe("2026-08-18"); // −2 úteis = terça
  });
});
