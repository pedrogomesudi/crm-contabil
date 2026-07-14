import { describe, it, expect } from "vitest";
import { aplicarEmail, variaveisDoCliente, htmlDoTexto } from "@/lib/email/template";

describe("template de e-mail", () => {
  it("substitui as variáveis no assunto e no corpo", () => {
    const vars = variaveisDoCliente(
      { razaoSocial: "Padaria Sol Ltda", cnpj: "12345678000199", email: "s@sol.com" },
      "Escritório SALDO",
      "2026-07-14",
    );
    const r = aplicarEmail({ assunto: "Olá {nome}", corpo: "De {escritorio}, em {hoje}." }, vars);
    expect(r.assunto).toBe("Olá Padaria Sol Ltda");
    expect(r.corpo).toBe("De Escritório SALDO, em 14/07/2026.");
  });

  it("troca chave ausente por vazio, sem quebrar", () => {
    const r = aplicarEmail({ assunto: "x", corpo: "Valor: {valor}." }, { nome: "A" });
    expect(r.corpo).toBe("Valor: .");
  });

  it("escapa HTML do corpo (o e-mail não pode virar vetor de injeção)", () => {
    expect(htmlDoTexto('<script>alert("x")</script>\nok')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>ok",
    );
  });
});
