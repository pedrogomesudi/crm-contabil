import { describe, it, expect } from "vitest";
import { prontidaoBoleto, type ConfigBoletoView } from "@/lib/boleto/config";

const base: ConfigBoletoView = {
  provedor: "inter",
  asaasAmbiente: "producao",
  interContaCorrente: "123456",
  contaBancariaId: "conta-1",
  asaasApiKeyDefinida: false,
  interClientIdDefinido: true,
  interClientSecretDefinido: true,
  interCertDefinido: true,
  interKeyDefinida: true,
};
const okDe = (itens: { rotulo: string; ok: boolean }[]) => itens.every((i) => i.ok);

describe("prontidaoBoleto", () => {
  it("tudo verde quando Inter completo + conta destino + webhook secret", () => {
    expect(okDe(prontidaoBoleto(base, true))).toBe(true);
  });
  it("falta o webhook secret => item de webhook fica falso", () => {
    const itens = prontidaoBoleto(base, false);
    expect(itens.some((i) => /webhook/i.test(i.rotulo) && !i.ok)).toBe(true);
  });
  it("falta conta de destino => item de conta fica falso", () => {
    const itens = prontidaoBoleto({ ...base, contaBancariaId: null }, true);
    expect(itens.some((i) => /conta/i.test(i.rotulo) && !i.ok)).toBe(true);
  });
  it("provedor nenhum => item de provedor falso e nada verde", () => {
    const itens = prontidaoBoleto({ ...base, provedor: "nenhum" }, true);
    expect(itens.some((i) => /provedor/i.test(i.rotulo) && !i.ok)).toBe(true);
    expect(okDe(itens)).toBe(false);
  });
  it("credenciais Inter incompletas => item de credenciais falso", () => {
    const itens = prontidaoBoleto({ ...base, interCertDefinido: false }, true);
    expect(itens.some((i) => /credenciais/i.test(i.rotulo) && !i.ok)).toBe(true);
  });
});
