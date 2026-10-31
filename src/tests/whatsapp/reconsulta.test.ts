import { describe, it, expect } from "vitest";
import { deveReconsultar, INTERVALO_MINIMO_MS } from "@/lib/whatsapp/reconsulta";

describe("deveReconsultar", () => {
  it("a primeira vez sempre reconsulta", () => {
    expect(deveReconsultar(null, 1_000_000, true)).toBe(true);
  });

  it("não reconsulta duas vezes dentro da janela mínima", () => {
    const agora = 1_000_000;
    expect(deveReconsultar(agora - 1000, agora, true)).toBe(false);
    expect(deveReconsultar(agora - INTERVALO_MINIMO_MS, agora, true)).toBe(true);
  });

  it("aba em segundo plano não reconsulta — ninguém está olhando, e o celular paga a conta", () => {
    const agora = 1_000_000;
    expect(deveReconsultar(null, agora, false)).toBe(false);
    expect(deveReconsultar(agora - 999_999, agora, false)).toBe(false);
  });

  it("trocar de app e voltar várias vezes seguidas gera UMA reconsulta, não uma por troca", () => {
    // É o caso real do celular: bloquear a tela, abrir o WhatsApp, voltar — cada evento
    // disparava uma busca completa.
    let ultima: number | null = null;
    let buscas = 0;
    for (const t of [0, 500, 1200, 3000, 8000, 15000]) {
      if (deveReconsultar(ultima, t, true)) {
        buscas++;
        ultima = t;
      }
    }
    expect(buscas).toBe(1);
  });

  it("depois da janela, volta a reconsultar", () => {
    let ultima: number | null = null;
    let buscas = 0;
    for (const t of [0, 10_000, 31_000, 35_000, 62_000]) {
      if (deveReconsultar(ultima, t, true)) {
        buscas++;
        ultima = t;
      }
    }
    expect(buscas).toBe(3);
  });
});
