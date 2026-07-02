import { SignedXml } from "xml-crypto";

// Assina o elemento infDPS (por Id): assinatura enveloped, exclusive-c14n,
// RSA-SHA256, com KeyInfo contendo o X509Certificate — padrão dos DFe.
export function assinarDps(xml: string, idDps: string, cert: { certPem: string; keyPem: string }): string {
  // A NFS-e nacional assina a DPS com C14N PADRÃO (REC-xml-c14n-20010315), não
  // exclusive-c14n — confirmado numa NFS-e real autorizada.
  const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N],
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
