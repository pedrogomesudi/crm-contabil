import { cifrar, decifrar } from "@/lib/nfse/cripto";

function chave(): string {
  const k = process.env.BOLETO_CRIPTO_KEY;
  if (!k) throw new Error("BOLETO_CRIPTO_KEY não configurada");
  return k;
}

export function cifrarCredencial(valor: string): string {
  return cifrar(Buffer.from(valor, "utf8"), chave());
}

export function decifrarCredencial(pacote: string): string {
  return decifrar(pacote, chave()).toString("utf8");
}
