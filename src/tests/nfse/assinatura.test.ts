import { describe, it, expect } from "vitest";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { montarDps } from "@/lib/nfse/dps";
import { assinarDps } from "@/lib/nfse/assinatura";
import type { DadosDps } from "@/lib/nfse/tipos";

function certParTeste() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const a = [{ name: "commonName", value: "T" }];
  cert.setSubject(a);
  cert.setIssuer(a);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

const dados: DadosDps = {
  config: {
    cnpj: "12345678000199",
    inscricaoMunicipal: "1",
    razaoSocial: "E",
    codigoMunicipio: "3170206",
    uf: "MG",
    codigoServicoNacional: "170201",
    descricaoServico: "Honorarios",
    aliquotaIss: 2,
    pctTribSN: 6,
    simplesNacional: true,
    ambiente: "homologacao",
  },
  tomador: { documento: "98765432000188", razaoSocial: "C" },
  valor: 500,
  competencia: "2026-07-01",
  serie: "1",
  numeroDps: "1",
};

describe("assinarDps", () => {
  it("produz uma assinatura enveloped válida sobre o infDPS", () => {
    const par = certParTeste();
    const { xml, idDps } = montarDps(dados);
    const assinado = assinarDps(xml, idDps, par);
    expect(assinado).toContain("Signature");
    expect(assinado).toContain(`URI="#${idDps}"`);
    // valida a assinatura com a chave pública do próprio cert
    const sigNode = /<(\w+:)?Signature[\s\S]*<\/(\w+:)?Signature>/.exec(assinado)![0];
    const sig = new SignedXml({ publicCert: par.certPem });
    sig.loadSignature(sigNode);
    expect(sig.checkSignature(assinado)).toBe(true);
  });
});
