import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Pacote: base64(iv) : base64(authTag) : base64(ciphertext). AES-256-GCM.
export function cifrar(dados: Buffer, chaveHex: string): string {
  const chave = Buffer.from(chaveHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const ct = Buffer.concat([cipher.update(dados), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decifrar(pacote: string, chaveHex: string): Buffer {
  const chave = Buffer.from(chaveHex, "hex");
  const [ivB64, tagB64, ctB64] = pacote.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("pacote cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", chave, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
}
