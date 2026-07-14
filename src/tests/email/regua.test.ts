import { describe, it, expect } from "vitest";
import { decidirCanal, podeEmail, conteudoEmail, type EstadoCanal } from "@/lib/email/regua";

const base: EstadoCanal = {
  whatsappConfigurado: true,
  telefone: "5511999999999",
  optOutWhatsapp: false,
  emailFallbackLigado: true,
  emailConfigurado: true,
  email: "cliente@x.com",
  optOutEmail: false,
};

describe("decidirCanal", () => {
  it("com tudo certo, tenta WhatsApp primeiro", () => {
    expect(decidirCanal(base).canal).toBe("whatsapp");
  });

  it("sem telefone, cai para e-mail", () => {
    expect(decidirCanal({ ...base, telefone: null }).canal).toBe("email");
  });

  it("WhatsApp não configurado (banimento do número), cai para e-mail", () => {
    expect(decidirCanal({ ...base, whatsappConfigurado: false }).canal).toBe("email");
  });

  it("opt-out de WhatsApp: o e-mail assume (não é mais silêncio total)", () => {
    expect(decidirCanal({ ...base, optOutWhatsapp: true }).canal).toBe("email");
  });

  it("opt-out dos dois canais: nada sai", () => {
    expect(decidirCanal({ ...base, optOutWhatsapp: true, optOutEmail: true }).canal).toBe("nenhum");
  });

  it("fallback desligado e sem WhatsApp: nada sai", () => {
    expect(decidirCanal({ ...base, whatsappConfigurado: false, emailFallbackLigado: false }).canal).toBe("nenhum");
  });

  it("sem e-mail cadastrado e sem telefone: nada sai", () => {
    expect(decidirCanal({ ...base, telefone: null, email: null }).canal).toBe("nenhum");
  });
});

describe("podeEmail", () => {
  it("exige fallback ligado, provedor configurado, e-mail e sem opt-out", () => {
    expect(podeEmail(base)).toBe(true);
    expect(podeEmail({ ...base, emailFallbackLigado: false })).toBe(false);
    expect(podeEmail({ ...base, emailConfigurado: false })).toBe(false);
    expect(podeEmail({ ...base, email: null })).toBe(false);
    expect(podeEmail({ ...base, optOutEmail: true })).toBe(false);
  });
});

describe("conteudoEmail", () => {
  const vars = { nome: "Padaria Sol", valor: "R$ 890,00", vencimento: "20/07/2026", dias: "3" };

  it("usa assunto e corpo próprios quando existem", () => {
    const r = conteudoEmail(
      { template: "wpp", email_assunto: "Cobrança de {valor}", email_corpo: "Olá {nome}, vence {vencimento}." },
      vars,
    );
    expect(r.assunto).toBe("Cobrança de R$ 890,00");
    expect(r.corpo).toBe("Olá Padaria Sol, vence 20/07/2026.");
  });

  it("sem corpo próprio, reaproveita o texto do WhatsApp (a régua não fica muda)", () => {
    const r = conteudoEmail(
      { template: "Olá {nome}, saldo de {valor}.", email_assunto: null, email_corpo: null },
      vars,
    );
    expect(r.corpo).toBe("Olá Padaria Sol, saldo de R$ 890,00.");
    expect(r.assunto).toBe("Cobrança — Padaria Sol");
  });
});
