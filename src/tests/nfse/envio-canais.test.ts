import { describe, it, expect } from "vitest";
import { canaisParaEnvio, agregarResultado } from "@/lib/nfse/envio-canais";

describe("canaisParaEnvio", () => {
  it("ambos com contatos envia os dois", () => {
    const r = canaisParaEnvio({ whatsapp: true, email: true }, { temTelefone: true, temEmail: true });
    expect(r.enviar).toEqual(["whatsapp", "email"]);
    expect(r.pulados).toEqual([]);
  });
  it("só whatsapp não dispara e-mail", () => {
    const r = canaisParaEnvio({ whatsapp: true, email: false }, { temTelefone: true, temEmail: true });
    expect(r.enviar).toEqual(["whatsapp"]);
  });
  it("e-mail selecionado sem e-mail cadastrado pula com aviso", () => {
    const r = canaisParaEnvio({ whatsapp: false, email: true }, { temTelefone: true, temEmail: false });
    expect(r.enviar).toEqual([]);
    expect(r.pulados).toEqual([{ canal: "email", status: "pulado", motivo: "Cliente sem e-mail." }]);
  });
  it("whatsapp selecionado sem telefone pula com aviso", () => {
    const r = canaisParaEnvio({ whatsapp: true, email: false }, { temTelefone: false, temEmail: true });
    expect(r.enviar).toEqual([]);
    expect(r.pulados).toEqual([{ canal: "whatsapp", status: "pulado", motivo: "Cliente sem telefone." }]);
  });
});

describe("agregarResultado", () => {
  it("sem nenhum canal é pulado", () => {
    expect(agregarResultado([])).toEqual({ status: "pulado", motivo: "Cliente sem canal com contato." });
  });
  it("qualquer erro vira erro com motivos", () => {
    const r = agregarResultado([
      { canal: "whatsapp", status: "ok" },
      { canal: "email", status: "erro", motivo: "SMTP recusou" },
    ]);
    expect(r.status).toBe("erro");
    expect(r.motivo).toContain("email: SMTP recusou");
  });
  it("algum ok e nenhum erro é ok", () => {
    expect(
      agregarResultado([
        { canal: "whatsapp", status: "ok" },
        { canal: "email", status: "pulado", motivo: "x" },
      ]),
    ).toEqual({ status: "ok" });
  });
  it("só pulados é pulado com motivos", () => {
    const r = agregarResultado([{ canal: "email", status: "pulado", motivo: "Cliente sem e-mail." }]);
    expect(r.status).toBe("pulado");
    expect(r.motivo).toContain("Cliente sem e-mail.");
  });
});
