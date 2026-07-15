import { cifrarDominio, decifrarDominio } from "@/lib/cripto/envelope";

// Credenciais de boleto (Inter/Asaas) via envelope. Async: a DEK vem do banco (com fallback
// para a chave de env na transição).
export async function cifrarCredencial(valor: string): Promise<string> {
  return cifrarDominio("boleto", Buffer.from(valor, "utf8"));
}

export async function decifrarCredencial(pacote: string): Promise<string> {
  return (await decifrarDominio("boleto", pacote)).toString("utf8");
}
