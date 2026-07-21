import { randomBytes, createHash } from "node:crypto";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function hashChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

// Chave sk_<32 chars base62>. A entropia (~190 bits) e o hash sha256 seguem o padrão da casa
// para segredos comparáveis (nunca revelados após a criação).
export function gerarChave(): { chave: string; hash: string; prefixo: string } {
  const bytes = randomBytes(32);
  let s = "";
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  const chave = `sk_${s}`;
  return { chave, hash: hashChave(chave), prefixo: chave.slice(0, 10) };
}

// Sem `necessario` (ex.: /ping) qualquer chave válida passa.
export function temEscopo(escopos: string[], necessario?: string): boolean {
  if (!necessario) return true;
  return escopos.includes(necessario);
}
