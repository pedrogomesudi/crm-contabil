import { describe, it, expect } from "vitest";
import { decidirGateAal, codigoTotpValido } from "@/lib/auth/mfa";

describe("decidirGateAal", () => {
  it("tem fator verificado mas sessão ainda aal1 => verificar", () => {
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal2" }, false)).toBe("verificar");
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal2" }, true)).toBe("verificar");
  });

  it("sessão já elevada (aal2) => ok", () => {
    expect(decidirGateAal({ currentLevel: "aal2", nextLevel: "aal2" }, false)).toBe("ok");
    expect(decidirGateAal({ currentLevel: "aal2", nextLevel: "aal2" }, true)).toBe("ok");
  });

  it("sem fator (nextLevel aal1) e não obrigatório => ok", () => {
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal1" }, false)).toBe("ok");
  });

  it("sem fator (nextLevel aal1) e obrigatório => enrollar", () => {
    expect(decidirGateAal({ currentLevel: "aal1", nextLevel: "aal1" }, true)).toBe("enrollar");
  });

  it("aal nulo (sessão sem info) => ok, nunca trava o usuário", () => {
    expect(decidirGateAal({ currentLevel: null, nextLevel: null }, false)).toBe("ok");
    expect(decidirGateAal({ currentLevel: null, nextLevel: null }, true)).toBe("ok");
  });
});

describe("codigoTotpValido", () => {
  it("aceita exatamente 6 dígitos (com espaços nas bordas)", () => {
    expect(codigoTotpValido("123456")).toBe(true);
    expect(codigoTotpValido("  654321 ")).toBe(true);
  });

  it("rejeita comprimento errado, letras e vazio", () => {
    expect(codigoTotpValido("12345")).toBe(false);
    expect(codigoTotpValido("1234567")).toBe(false);
    expect(codigoTotpValido("12ab56")).toBe(false);
    expect(codigoTotpValido("")).toBe(false);
    expect(codigoTotpValido("   ")).toBe(false);
  });
});
