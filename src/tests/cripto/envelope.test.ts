import { describe, it, expect } from "vitest";
import { embrulhar, desembrulhar } from "@/lib/cripto/embrulho";
import { cifrar, decifrar } from "@/lib/nfse/cripto";

const master = "a".repeat(64);
const dek = "b".repeat(64);

describe("envelope — embrulhar/desembrulhar a DEK", () => {
  it("desembrulhar reverte embrulhar", () => {
    expect(desembrulhar(embrulhar(dek, master), master)).toBe(dek);
  });

  it("mestra errada não desembrulha (o GCM rejeita)", () => {
    const pacote = embrulhar(dek, master);
    expect(() => desembrulhar(pacote, "c".repeat(64))).toThrow();
  });

  it("a DEK desembrulhada decifra o que ela mesma cifrou — a continuidade que zera a re-cifragem", () => {
    // O ponto do desenho: a DEK É a chave antiga; o dado cifrado por ela decifra igual,
    // agora que a DEK vem de dentro do envelope.
    const segredo = Buffer.from("token-secreto", "utf8");
    const ct = cifrar(segredo, dek);
    const dekRecuperada = desembrulhar(embrulhar(dek, master), master);
    expect(decifrar(ct, dekRecuperada).toString("utf8")).toBe("token-secreto");
  });

  it("rotação da mestra: re-embrulhar com outra mestra preserva a DEK", () => {
    const nova = "d".repeat(64);
    const embrulhoNovo = embrulhar(desembrulhar(embrulhar(dek, master), master), nova);
    expect(desembrulhar(embrulhoNovo, nova)).toBe(dek);
  });
});
