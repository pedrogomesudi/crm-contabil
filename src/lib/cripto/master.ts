// A chave-mestra (KEK): a única que sobra no ambiente, e a única rotacionável.
// Cifra as DEKs guardadas em `chave_dados`. Hex de 32 bytes (64 chars).
export function masterKey(): string {
  const k = process.env.MASTER_CRIPTO_KEY;
  if (!k) throw new Error("MASTER_CRIPTO_KEY não configurada no servidor.");
  if (!/^[0-9a-fA-F]{64}$/.test(k)) throw new Error("MASTER_CRIPTO_KEY inválida (esperado 64 hex).");
  return k.toLowerCase();
}
