import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cifrarSenha, decifrarSenha } from "@/lib/onboarding/credencial";

describe("credencial", () => {
  const orig = process.env.ONBOARDING_CRIPTO_KEY;
  beforeEach(() => {
    process.env.ONBOARDING_CRIPTO_KEY = "a".repeat(64);
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.ONBOARDING_CRIPTO_KEY;
    else process.env.ONBOARDING_CRIPTO_KEY = orig;
  });
  it("round-trip cifra/decifra", () => {
    const pacote = cifrarSenha("s3nh@!Portal");
    expect(pacote).not.toContain("s3nh@");
    expect(decifrarSenha(pacote)).toBe("s3nh@!Portal");
  });
  it("sem chave → erro claro", () => {
    delete process.env.ONBOARDING_CRIPTO_KEY;
    expect(() => cifrarSenha("x")).toThrow(/ONBOARDING_CRIPTO_KEY/);
  });
});
