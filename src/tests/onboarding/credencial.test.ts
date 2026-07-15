import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cifrarSenha, decifrarSenha } from "@/lib/onboarding/credencial";
import { limparCacheDek } from "@/lib/cripto/envelope";

// Sem SUPABASE_* no ambiente de teste, o dekDoDominio cai no FALLBACK (a chave de env) —
// que é exatamente o comportamento da transição. O cache é limpo entre casos.
describe("credencial (cofre de acessos, via envelope)", () => {
  const orig = process.env.ONBOARDING_CRIPTO_KEY;
  beforeEach(() => {
    limparCacheDek();
    process.env.ONBOARDING_CRIPTO_KEY = "a".repeat(64);
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.ONBOARDING_CRIPTO_KEY;
    else process.env.ONBOARDING_CRIPTO_KEY = orig;
    limparCacheDek();
  });

  it("round-trip cifra/decifra", async () => {
    const pacote = await cifrarSenha("s3nh@!Portal");
    expect(pacote).not.toContain("s3nh@");
    expect(await decifrarSenha(pacote)).toBe("s3nh@!Portal");
  });

  it("sem DEK nem chave de env → erro claro", async () => {
    delete process.env.ONBOARDING_CRIPTO_KEY;
    limparCacheDek();
    await expect(cifrarSenha("x")).rejects.toThrow(/onboarding/i);
  });
});
