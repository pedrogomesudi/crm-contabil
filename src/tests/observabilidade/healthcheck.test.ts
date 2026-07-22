import { describe, it, expect } from "vitest";
import { urlDoHealthcheck } from "@/lib/observabilidade/healthcheck";

const MAPA = JSON.stringify({
  "gerar-obrigacoes": "https://hc-ping.com/abc",
  "regua-cobranca": "https://hc-ping.com/def/",
});

describe("urlDoHealthcheck", () => {
  it("success devolve a URL base", () => {
    expect(urlDoHealthcheck(MAPA, "gerar-obrigacoes", "success")).toBe("https://hc-ping.com/abc");
  });

  it("fail acrescenta /fail (sem barra dupla)", () => {
    expect(urlDoHealthcheck(MAPA, "gerar-obrigacoes", "fail")).toBe("https://hc-ping.com/abc/fail");
    expect(urlDoHealthcheck(MAPA, "regua-cobranca", "fail")).toBe("https://hc-ping.com/def/fail");
  });

  it("env ausente, JSON inválido ou nome desconhecido => null", () => {
    expect(urlDoHealthcheck(undefined, "gerar-obrigacoes", "success")).toBeNull();
    expect(urlDoHealthcheck("{nao é json", "gerar-obrigacoes", "success")).toBeNull();
    expect(urlDoHealthcheck(MAPA, "inexistente", "success")).toBeNull();
    expect(urlDoHealthcheck(JSON.stringify({ x: 123 }), "x", "success")).toBeNull();
  });
});
