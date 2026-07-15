import { cifrarDominio, decifrarDominio } from "@/lib/cripto/envelope";

// Cifra uma senha de portal (AES-GCM, via envelope). Retorna o pacote string; nunca sai em
// texto. Async porque a DEK vem do banco (com fallback para a chave de env na transição).
export async function cifrarSenha(senha: string): Promise<string> {
  return cifrarDominio("onboarding", Buffer.from(senha, "utf8"));
}

// Decifra o pacote (só no servidor, em ação gated + auditada).
export async function decifrarSenha(pacote: string): Promise<string> {
  return (await decifrarDominio("onboarding", pacote)).toString("utf8");
}
