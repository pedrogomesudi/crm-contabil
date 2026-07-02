import { describe, it, expect } from "vitest";
import forge from "node-forge";
import { carregarCertificado } from "@/lib/nfse/certificado";

function pfxDeTeste(senha: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: "ESCRITORIO TESTE" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12).getBytes();
  return Buffer.from(der, "binary");
}

describe("carregarCertificado", () => {
  it("extrai cert/key PEM e validade do .pfx", () => {
    const cert = carregarCertificado(pfxDeTeste("segredo"), "segredo");
    expect(cert.certPem).toContain("BEGIN CERTIFICATE");
    expect(cert.keyPem).toContain("PRIVATE KEY");
    expect(cert.validade.getTime()).toBeGreaterThan(Date.now());
  });
  it("lança com senha errada", () => {
    expect(() => carregarCertificado(pfxDeTeste("certa"), "errada")).toThrow();
  });
});
