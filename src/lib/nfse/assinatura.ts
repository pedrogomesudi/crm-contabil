import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

// Assina o elemento `localName` (por Id): assinatura enveloped, C14N padrão,
// RSA-SHA256, KeyInfo com X509 — padrão dos DFe (confirmado numa NFS-e real).
export function assinarXmlDsig(
  xml: string,
  id: string,
  localName: string,
  cert: { certPem: string; keyPem: string },
): string {
  const xpath = `//*[local-name(.)='${localName}']`;
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath,
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: `#${id}`,
  });
  const x509 = cert.certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${x509}</X509Certificate></X509Data>`;
  sig.computeSignature(xml, { location: { reference: xpath, action: "after" } });
  return sig.getSignedXml();
}

export function assinarDps(xml: string, idDps: string, cert: { certPem: string; keyPem: string }): string {
  return assinarXmlDsig(xml, idDps, "infDPS", cert);
}
