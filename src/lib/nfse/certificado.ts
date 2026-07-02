import forge from "node-forge";
import type { Certificado } from "./tipos";

export function carregarCertificado(pfx: Buffer, senha: string): Certificado {
  const der = forge.util.createBuffer(pfx.toString("binary"));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha); // lança se a senha estiver errada
  const certOid = forge.pki.oids.certBag as string;
  const keyOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
  const certBags = p12.getBags({ bagType: certOid })[certOid] ?? [];
  const keyBags = p12.getBags({ bagType: keyOid })[keyOid] ?? [];
  const certObj = certBags[0]?.cert;
  const keyObj = keyBags[0]?.key;
  if (!certObj || !keyObj) throw new Error("certificado ou chave não encontrados no .pfx");
  return {
    certPem: forge.pki.certificateToPem(certObj),
    keyPem: forge.pki.privateKeyToPem(keyObj),
    pfx,
    senha,
    validade: certObj.validity.notAfter,
  };
}
