// Helpers de criptografia para os scripts (envelope). JS puro, sem depender do app.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Mesmo formato do app (src/lib/nfse/cripto.ts): base64(iv):base64(tag):base64(ct), AES-256-GCM.
export function cifrar(dados, chaveHex) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(chaveHex, "hex"), iv);
  const ct = Buffer.concat([cipher.update(dados), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decifrar(pacote, chaveHex) {
  const [ivB64, tagB64, ctB64] = pacote.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("pacote cifrado inválido");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(chaveHex, "hex"), Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(ctB64, "base64")), d.final()]);
}

export const embrulhar = (dekHex, masterHex) => cifrar(Buffer.from(dekHex, "hex"), masterHex);
export const desembrulhar = (dekCifrado, masterHex) => decifrar(dekCifrado, masterHex).toString("hex");

// Os 5 domínios e a env de cada um.
export const DOMINIOS = {
  whatsapp: "WHATSAPP_CRIPTO_KEY",
  onboarding: "ONBOARDING_CRIPTO_KEY",
  boleto: "BOLETO_CRIPTO_KEY",
  email: "EMAIL_CRIPTO_KEY",
  nfse: "NFSE_CERT_KEY",
};

// Onde há dado REAL cifrado, para o auto-teste. Uma consulta que devolve UM pacote cifrado,
// ou null se não houver dado ainda naquele domínio (o teste daquele é pulado).
export const AMOSTRA_SQL = {
  whatsapp: "select token_cifrado as pacote from whatsapp_config where token_cifrado is not null limit 1",
  onboarding:
    "select acesso_senha_cifrada as pacote from onboarding_processo_item where acesso_senha_cifrada is not null limit 1",
  boleto:
    "select asaas_api_key_cifrada as pacote from boleto_config where asaas_api_key_cifrada is not null limit 1",
  email: "select smtp_senha_cifrada as pacote from email_config where smtp_senha_cifrada is not null limit 1",
  nfse: "select pfx_cifrado as pacote from nfse_certificado where pfx_cifrado is not null limit 1",
};

export const mascarar = (s) => String(s ?? "").replace(/[0-9a-f]{16,}/gi, (m) => m.slice(0, 6) + "…");
