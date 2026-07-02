import { SignedXml } from "xml-crypto";

// Assina o elemento infDPS (por Id): assinatura enveloped, exclusive-c14n,
// RSA-SHA256, com KeyInfo contendo o X509Certificate — padrão dos DFe.
export function assinarDps(xml: string, idDps: string, cert: { certPem: string; keyPem: string }): string {
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: `#${idDps}`,
  });
  const x509 = cert.certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${x509}</X509Certificate></X509Data>`;
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infDPS']", action: "after" },
  });
  return sig.getSignedXml();
}
