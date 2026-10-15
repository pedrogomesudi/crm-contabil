import { describe, it, expect } from "vitest";
import { decidirCanal, podeEmail, conteudoEmail, destinosDaRegua, type EstadoCanal } from "@/lib/email/regua";

const base: EstadoCanal = {
  whatsappConfigurado: true,
  telefones: ["5511999999999"],
  optOutWhatsapp: false,
  emailFallbackLigado: true,
  emailConfigurado: true,
  emails: ["cliente@x.com"],
  optOutEmail: false,
};

describe("decidirCanal", () => {
  it("com tudo certo, tenta WhatsApp primeiro", () => {
    expect(decidirCanal(base).canal).toBe("whatsapp");
  });

  it("sem telefone, cai para e-mail", () => {
    expect(decidirCanal({ ...base, telefones: [] }).canal).toBe("email");
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
    expect(decidirCanal({ ...base, telefones: [], emails: [] }).canal).toBe("nenhum");
  });
});

describe("podeEmail", () => {
  it("exige fallback ligado, provedor configurado, e-mail e sem opt-out", () => {
    expect(podeEmail(base)).toBe(true);
    expect(podeEmail({ ...base, emailFallbackLigado: false })).toBe(false);
    expect(podeEmail({ ...base, emailConfigurado: false })).toBe(false);
    expect(podeEmail({ ...base, emails: [] })).toBe(false);
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

describe("destinosDaRegua — o 2º contato entra no envio", () => {
  it("manda para TODOS os telefones marcados, não só o principal", () => {
    const r = destinosDaRegua({ ...base, telefones: ["5511999999999", "5511888888888"] });
    expect(r.canal).toBe("whatsapp");
    expect(r.destinos).toEqual(["5511999999999", "5511888888888"]);
  });

  it("no canal e-mail, manda para todos os e-mails marcados", () => {
    const r = destinosDaRegua({ ...base, telefones: [], emails: ["a@x.com", "b@x.com"] });
    expect(r.canal).toBe("email");
    expect(r.destinos).toEqual(["a@x.com", "b@x.com"]);
  });

  it("opt-out de WhatsApp manda para os dois e-mails, não para os telefones", () => {
    const r = destinosDaRegua({
      ...base,
      optOutWhatsapp: true,
      telefones: ["5511999999999", "5511888888888"],
      emails: ["a@x.com", "b@x.com"],
    });
    expect(r.canal).toBe("email");
    expect(r.destinos).toEqual(["a@x.com", "b@x.com"]);
  });

  it("sem canal possível, não há destino nenhum", () => {
    const r = destinosDaRegua({ ...base, telefones: [], emails: [] });
    expect(r.canal).toBe("nenhum");
    expect(r.destinos).toEqual([]);
  });

  it("um contato só continua sendo um envio só (quem não configurou o 2º não muda de comportamento)", () => {
    expect(destinosDaRegua(base).destinos).toHaveLength(1);
  });
});

describe("podeWhatsapp/podeEmail com listas", () => {
  it("lista vazia é o mesmo que não ter contato", () => {
    expect(podeEmail({ ...base, emails: [] })).toBe(false);
    expect(podeEmail({ ...base, emails: ["a@x.com"] })).toBe(true);
  });
});
