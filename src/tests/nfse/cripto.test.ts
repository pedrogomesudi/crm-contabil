import { describe, it, expect } from "vitest";
import { cifrar, decifrar } from "@/lib/nfse/cripto";

const CHAVE = "0".repeat(64); // 32 bytes em hex

describe("cripto do certificado", () => {
  it("faz round-trip cifra/decifra", () => {
    const original = Buffer.from("conteudo-do-pfx-binário\x00\x01");
    const pacote = cifrar(original, CHAVE);
    expect(pacote).not.toContain("conteudo");
    expect(decifrar(pacote, CHAVE).equals(original)).toBe(true);
  });
  it("falha ao decifrar com chave errada", () => {
    const pacote = cifrar(Buffer.from("x"), CHAVE);
    expect(() => decifrar(pacote, "f".repeat(64))).toThrow();
  });
});
