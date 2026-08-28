import { describe, it, expect } from "vitest";
import { emailsDeEnvio, telefonesDeEnvio } from "@/lib/clientes/contatos-envio";

describe("emailsDeEnvio", () => {
  it("default: só o principal", () => {
    expect(emailsDeEnvio({ email: "A@x.com" })).toEqual(["a@x.com"]);
  });
  it("ambos quando o 2º está ligado", () => {
    expect(emailsDeEnvio({ email: "a@x.com", email_2: "b@x.com", email_2_envio: true })).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });
  it("só o 2º quando o principal está desligado", () => {
    expect(emailsDeEnvio({ email: "a@x.com", email_envio: false, email_2: "b@x.com", email_2_envio: true })).toEqual([
      "b@x.com",
    ]);
  });
  it("ignora vazios e deduplica", () => {
    expect(emailsDeEnvio({ email: "a@x.com", email_2: "A@X.com", email_2_envio: true })).toEqual(["a@x.com"]);
    expect(emailsDeEnvio({ email: "", email_2: "", email_2_envio: true })).toEqual([]);
  });
});

describe("telefonesDeEnvio", () => {
  it("default: só o principal (formato Z-API)", () => {
    expect(telefonesDeEnvio({ telefone: "34999998888", telefone_ddi: "55" })).toEqual(["5534999998888"]);
  });
  it("ambos quando o 2º está ligado", () => {
    const r = telefonesDeEnvio({
      telefone: "34999998888",
      telefone_2: "34988887777",
      whatsapp_2_envio: true,
    });
    expect(r).toEqual(["5534999998888", "5534988887777"]);
  });
  it("só o 2º quando o principal está desligado", () => {
    const r = telefonesDeEnvio({
      telefone: "34999998888",
      whatsapp_envio: false,
      telefone_2: "34988887777",
      whatsapp_2_envio: true,
    });
    expect(r).toEqual(["5534988887777"]);
  });
  it("sem telefone válido → vazio", () => {
    expect(telefonesDeEnvio({ telefone: "", whatsapp_2_envio: true, telefone_2: "" })).toEqual([]);
  });
});
