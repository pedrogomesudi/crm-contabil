import { cifrar, decifrar } from "@/lib/nfse/cripto";

function chave(): string {
  const k = process.env.ONBOARDING_CRIPTO_KEY;
  if (!k) throw new Error("ONBOARDING_CRIPTO_KEY não configurada");
  return k;
}

// Cifra uma senha de portal (AES-GCM). Retorna o pacote string; nunca sai em texto.
export function cifrarSenha(senha: string): string {
  return cifrar(Buffer.from(senha, "utf8"), chave());
}

// Decifra o pacote (só no servidor, em ação gated + auditada).
export function decifrarSenha(pacote: string): string {
  return decifrar(pacote, chave()).toString("utf8");
}
