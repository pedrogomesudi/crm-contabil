import { describe, it, expect } from "vitest";
import { statusConfigBoleto, type ConfigBoletoView } from "@/lib/boleto/config";

const base: ConfigBoletoView = { provedor: "nenhum", asaasAmbiente: "producao", interContaCorrente: null, contaBancariaId: null, asaasApiKeyDefinida: false, interClientIdDefinido: false, interClientSecretDefinido: false, interCertDefinido: false, interKeyDefinida: false };

describe("statusConfigBoleto", () => {
  it("nenhum → não configurado", () => {
    expect(statusConfigBoleto(base)).toEqual({ provedor: "nenhum", configurado: false });
  });
  it("asaas com api key → configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "asaas", asaasApiKeyDefinida: true })).toEqual({ provedor: "asaas", configurado: true });
  });
  it("asaas sem api key → não configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "asaas" }).configurado).toBe(false);
  });
  it("inter completo → configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "inter", interContaCorrente: "123", interClientIdDefinido: true, interClientSecretDefinido: true, interCertDefinido: true, interKeyDefinida: true }).configurado).toBe(true);
  });
  it("inter faltando a chave → não configurado", () => {
    expect(statusConfigBoleto({ ...base, provedor: "inter", interContaCorrente: "123", interClientIdDefinido: true, interClientSecretDefinido: true, interCertDefinido: true, interKeyDefinida: false }).configurado).toBe(false);
  });
});
