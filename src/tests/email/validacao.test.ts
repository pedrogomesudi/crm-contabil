import { describe, it, expect } from "vitest";
import { emailValido, validarEnvio, LIMITES } from "@/lib/email/validacao";

describe("validação de envio", () => {
  it("aceita e-mail bem formado e rejeita o resto", () => {
    expect(emailValido("a@b.com")).toBe(true);
    expect(emailValido("a@b")).toBe(false);
    expect(emailValido("sem-arroba.com")).toBe(false);
    expect(emailValido("")).toBe(false);
  });

  it("exige destinatário, assunto e corpo", () => {
    expect(validarEnvio({ para: "", assunto: "a", corpo: "b" })).toBe("Informe o destinatário.");
    expect(validarEnvio({ para: "a@b.com", assunto: "  ", corpo: "b" })).toBe("Informe o assunto.");
    expect(validarEnvio({ para: "a@b.com", assunto: "a", corpo: "" })).toBe("Escreva a mensagem.");
    expect(validarEnvio({ para: "a@b.com", assunto: "a", corpo: "b" })).toBeNull();
  });

  it("barra assunto e corpo acima do limite", () => {
    expect(validarEnvio({ para: "a@b.com", assunto: "x".repeat(LIMITES.assunto + 1), corpo: "b" })).toBe(
      "Assunto muito longo.",
    );
    expect(validarEnvio({ para: "a@b.com", assunto: "a", corpo: "x".repeat(LIMITES.corpo + 1) })).toBe(
      "Mensagem muito longa.",
    );
  });
});
